--
-- PostgreSQL database dump
--


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 888 (class 1247 OID 16437)
-- Name: culture_phase; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.culture_phase AS ENUM (
    'Initiation',
    'Multiplication',
    'Rooting',
    'Acclimatization',
    'Other'
);


--
-- TOC entry 244 (class 1255 OID 16511)
-- Name: adjust_inventory_on_contamination(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.adjust_inventory_on_contamination() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_op               RECORD;
  v_lab_id            INT;
  v_species_id        INT;
  v_target_sub        INT;
  v_delta             INT;
  v_target_stock      INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.contaminated_jars;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := NEW.contaminated_jars - OLD.contaminated_jars;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := - OLD.contaminated_jars; -- add back
  END IF;

  -- If delta = 0, nothing to do
  IF v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Load related operation + mother inventory + species
  SELECT
    d.id,
    d.phase_of_culture,
    d.number_new_jars,
    d.subculture_new_jar,
    i.lab_id,
    i.species_id
  INTO v_op
  FROM daily_operations d
  JOIN inventory i ON i.id = d.inventory_id
  WHERE d.id = COALESCE(NEW.operation_id, OLD.operation_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operation % not found', COALESCE(NEW.operation_id, OLD.operation_id);
  END IF;

  -- Terminal phases (no target subculture inventory to adjust)
  IF v_op.phase_of_culture IN ('Rooting', 'Acclimatization') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_lab_id := v_op.lab_id;
  v_species_id := v_op.species_id;
  v_target_sub := v_op.subculture_new_jar;

  IF v_target_sub IS NULL THEN
    -- Should not happen for non-rooting because daily trigger sets it
    RAISE EXCEPTION 'subculture_new_jar is NULL for non-rooting operation %', v_op.id;
  END IF;

  -- Validate contamination not exceeding produced jars for that operation (on INSERT/UPDATE)
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.contaminated_jars > v_op.number_new_jars THEN
      RAISE EXCEPTION 'Contaminated jars (%) cannot exceed produced jars (%) for operation %',
        NEW.contaminated_jars, v_op.number_new_jars, v_op.id;
    END IF;
  END IF;

  -- Lock target inventory row and adjust
  SELECT number_mother_jar
  INTO v_target_stock
  FROM inventory
  WHERE lab_id = v_lab_id
    AND species_id = v_species_id
    AND subculture_mother_jars = v_target_sub
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target inventory not found for species_id % subculture % (operation %)',
      v_species_id, v_target_sub, v_op.id;
  END IF;

  -- Apply delta (subtract if delta positive, add back if negative)
  IF (v_target_stock - v_delta) < 0 THEN
    RAISE EXCEPTION 'Inventory would become negative (current %, delta %)', v_target_stock, v_delta;
  END IF;

  UPDATE inventory
  SET number_mother_jar = number_mother_jar - v_delta
  WHERE lab_id = v_lab_id
    AND species_id = v_species_id
    AND subculture_mother_jars = v_target_sub;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- TOC entry 245 (class 1255 OID 32794)
-- Name: apply_inventory_adjustment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.apply_inventory_adjustment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_current INT;
BEGIN
  SELECT number_mother_jar
  INTO v_current
  FROM inventory
  WHERE id = NEW.inventory_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Inventory not found';
  END IF;

  IF NEW.qty > v_current THEN
    RAISE EXCEPTION 'Adjustment qty exceeds available stock';
  END IF;

  UPDATE inventory
  SET number_mother_jar = number_mother_jar - NEW.qty
  WHERE id = NEW.inventory_id;

  RETURN NEW;
END;
$$;


--
-- TOC entry 243 (class 1255 OID 16507)
-- Name: set_updated_at_inventory(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at_inventory() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- TOC entry 257 (class 1255 OID 16509)
-- Name: update_inventory_after_operation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_inventory_after_operation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_species_id          INT;
  v_lab_id              INT;
  v_mother_subculture   INT;
  v_mother_stock        INT;
  v_new_subculture      INT;
BEGIN
  -- Lock mother inventory row
  SELECT lab_id, species_id, subculture_mother_jars, number_mother_jar
  INTO v_lab_id, v_species_id, v_mother_subculture, v_mother_stock
  FROM inventory
  WHERE id = NEW.inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_id % not found', NEW.inventory_id;
  END IF;

  -- Validate stock
  IF NEW.used_mother_jars > v_mother_stock THEN
    RAISE EXCEPTION 'Used mother jars (%) exceed available stock (%)',
      NEW.used_mother_jars, v_mother_stock;
  END IF;

  -- 1) subtract from mother inventory (always)
  UPDATE inventory
  SET number_mother_jar = number_mother_jar - NEW.used_mother_jars
  WHERE id = NEW.inventory_id;

  -- Terminal phases: ignore creating subculture / adding new jars to inventory
  IF NEW.phase_of_culture IN ('Rooting', 'Acclimatization') THEN
    NEW.subculture_new_jar := NULL;
    RETURN NEW;
  END IF;

  -- 2) compute & enforce new subculture = mother + 1
  v_new_subculture := v_mother_subculture + 1;

  IF NEW.subculture_new_jar IS NULL THEN
    NEW.subculture_new_jar := v_new_subculture;
  ELSIF NEW.subculture_new_jar <> v_new_subculture THEN
    RAISE EXCEPTION 'subculture_new_jar must be mother_subculture+1 (= %). You sent %',
      v_new_subculture, NEW.subculture_new_jar;
  END IF;

  -- 3) add produced jars to target subculture inventory (upsert)
  INSERT INTO inventory (lab_id, species_id, subculture_mother_jars, number_mother_jar)
  VALUES (v_lab_id, v_species_id, v_new_subculture, NEW.number_new_jars)
  ON CONFLICT (lab_id, species_id, subculture_mother_jars)
  DO UPDATE
  SET number_mother_jar = inventory.number_mother_jar + EXCLUDED.number_mother_jar;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 16477)
-- Name: contamination_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contamination_records (
    id integer NOT NULL,
    operation_id integer NOT NULL,
    employee_id integer NOT NULL,
    detected_date date NOT NULL,
    contaminated_jars integer NOT NULL,
    contamination_type character varying(100),
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT contamination_records_contaminated_jars_check CHECK ((contaminated_jars >= 0))
);


--
-- TOC entry 227 (class 1259 OID 16476)
-- Name: contamination_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.contamination_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5152 (class 0 OID 0)
-- Dependencies: 227
-- Name: contamination_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.contamination_records_id_seq OWNED BY public.contamination_records.id;


--
-- TOC entry 226 (class 1259 OID 16444)
-- Name: daily_operations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_operations (
    id integer NOT NULL,
    operations_date date NOT NULL,
    employee_id integer NOT NULL,
    inventory_id integer NOT NULL,
    phase_of_culture public.culture_phase DEFAULT 'Multiplication'::public.culture_phase NOT NULL,
    used_mother_jars integer NOT NULL,
    number_new_jars integer NOT NULL,
    subculture_new_jar integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_operations_number_new_jars_check CHECK ((number_new_jars >= 0)),
    CONSTRAINT daily_operations_subculture_new_jar_check CHECK ((subculture_new_jar >= 0)),
    CONSTRAINT daily_operations_used_mother_jars_check CHECK ((used_mother_jars >= 0))
);


--
-- TOC entry 225 (class 1259 OID 16443)
-- Name: daily_operations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.daily_operations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5153 (class 0 OID 0)
-- Dependencies: 225
-- Name: daily_operations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.daily_operations_id_seq OWNED BY public.daily_operations.id;


--
-- TOC entry 220 (class 1259 OID 16390)
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    lab_id integer NOT NULL
);


--
-- TOC entry 219 (class 1259 OID 16389)
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5154 (class 0 OID 0)
-- Dependencies: 219
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- TOC entry 224 (class 1259 OID 16412)
-- Name: inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory (
    id integer NOT NULL,
    species_id integer NOT NULL,
    subculture_mother_jars integer NOT NULL,
    number_mother_jar integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    lab_id integer NOT NULL,
    CONSTRAINT inventory_number_mother_jar_check CHECK ((number_mother_jar >= 0)),
    CONSTRAINT inventory_subculture_mother_jars_check CHECK ((subculture_mother_jars >= 0))
);


--
-- TOC entry 230 (class 1259 OID 32769)
-- Name: inventory_adjustments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_adjustments (
    id integer NOT NULL,
    adjustment_date date DEFAULT CURRENT_DATE NOT NULL,
    inventory_id integer NOT NULL,
    employee_id integer,
    type character varying(30) NOT NULL,
    qty integer NOT NULL,
    notes text,
    CONSTRAINT inventory_adjustments_qty_check CHECK ((qty > 0))
);


--
-- TOC entry 229 (class 1259 OID 32768)
-- Name: inventory_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5155 (class 0 OID 0)
-- Dependencies: 229
-- Name: inventory_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_adjustments_id_seq OWNED BY public.inventory_adjustments.id;


--
-- TOC entry 223 (class 1259 OID 16411)
-- Name: inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5156 (class 0 OID 0)
-- Dependencies: 223
-- Name: inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_id_seq OWNED BY public.inventory.id;


--
-- TOC entry 240 (class 1259 OID 41101)
-- Name: lab_billing_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lab_billing_history (
    id integer NOT NULL,
    lab_id integer NOT NULL,
    event_type text NOT NULL,
    plan_code text NOT NULL,
    plan_label text NOT NULL,
    amount_cents integer,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    period_starts_at timestamp with time zone,
    period_ends_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 239 (class 1259 OID 41100)
-- Name: lab_billing_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lab_billing_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5157 (class 0 OID 0)
-- Dependencies: 239
-- Name: lab_billing_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lab_billing_history_id_seq OWNED BY public.lab_billing_history.id;


--
-- TOC entry 234 (class 1259 OID 40983)
-- Name: labs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.labs (
    id integer NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    subscription_plan text DEFAULT 'trial'::text NOT NULL,
    subscription_status text DEFAULT 'trialing'::text NOT NULL,
    subscription_starts_at timestamp with time zone,
    subscription_ends_at timestamp with time zone,
    trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
    max_users integer DEFAULT 3,
    max_employees integer DEFAULT 10,
    max_species integer DEFAULT 20,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    logo_path text
);


--
-- TOC entry 233 (class 1259 OID 40982)
-- Name: labs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.labs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5158 (class 0 OID 0)
-- Dependencies: 233
-- Name: labs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.labs_id_seq OWNED BY public.labs.id;


--
-- TOC entry 242 (class 1259 OID 41128)
-- Name: newsletter_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.newsletter_subscriptions (
    id bigint NOT NULL,
    lab_id bigint,
    email text NOT NULL,
    source text DEFAULT 'footer'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    subscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 241 (class 1259 OID 41127)
-- Name: newsletter_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.newsletter_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5159 (class 0 OID 0)
-- Dependencies: 241
-- Name: newsletter_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.newsletter_subscriptions_id_seq OWNED BY public.newsletter_subscriptions.id;


--
-- TOC entry 238 (class 1259 OID 41070)
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 237 (class 1259 OID 41069)
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5160 (class 0 OID 0)
-- Dependencies: 237
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- TOC entry 222 (class 1259 OID 16401)
-- Name: species; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.species (
    id integer NOT NULL,
    species_name character varying(120) NOT NULL,
    lab_id integer NOT NULL
);


--
-- TOC entry 221 (class 1259 OID 16400)
-- Name: species_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.species_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5161 (class 0 OID 0)
-- Dependencies: 221
-- Name: species_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.species_id_seq OWNED BY public.species.id;


--
-- TOC entry 236 (class 1259 OID 41029)
-- Name: user_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_invites (
    id integer NOT NULL,
    lab_id integer NOT NULL,
    invited_by_user_id integer NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'staff'::text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    accepted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    accepted_user_id integer,
    CONSTRAINT user_invites_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'staff'::text]))),
    CONSTRAINT user_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])))
);


--
-- TOC entry 235 (class 1259 OID 41028)
-- Name: user_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5162 (class 0 OID 0)
-- Dependencies: 235
-- Name: user_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_invites_id_seq OWNED BY public.user_invites.id;


--
-- TOC entry 232 (class 1259 OID 40961)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    full_name character varying(120) NOT NULL,
    username character varying(60) NOT NULL,
    email character varying(120),
    password_hash text NOT NULL,
    role character varying(30) DEFAULT 'staff'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    lab_id integer NOT NULL,
    employee_id integer,
    auth_provider text DEFAULT 'password'::text NOT NULL,
    google_sub text,
    CONSTRAINT users_auth_provider_check CHECK ((auth_provider = ANY (ARRAY['password'::text, 'google'::text]))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'manager'::character varying, 'staff'::character varying])::text[])))
);


--
-- TOC entry 231 (class 1259 OID 40960)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5163 (class 0 OID 0)
-- Dependencies: 231
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 4879 (class 2604 OID 16480)
-- Name: contamination_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contamination_records ALTER COLUMN id SET DEFAULT nextval('public.contamination_records_id_seq'::regclass);


--
-- TOC entry 4876 (class 2604 OID 16447)
-- Name: daily_operations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_operations ALTER COLUMN id SET DEFAULT nextval('public.daily_operations_id_seq'::regclass);


--
-- TOC entry 4871 (class 2604 OID 16393)
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- TOC entry 4873 (class 2604 OID 16415)
-- Name: inventory id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory ALTER COLUMN id SET DEFAULT nextval('public.inventory_id_seq'::regclass);


--
-- TOC entry 4881 (class 2604 OID 32772)
-- Name: inventory_adjustments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_adjustments ALTER COLUMN id SET DEFAULT nextval('public.inventory_adjustments_id_seq'::regclass);


--
-- TOC entry 4903 (class 2604 OID 41104)
-- Name: lab_billing_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lab_billing_history ALTER COLUMN id SET DEFAULT nextval('public.lab_billing_history_id_seq'::regclass);


--
-- TOC entry 4889 (class 2604 OID 40986)
-- Name: labs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.labs ALTER COLUMN id SET DEFAULT nextval('public.labs_id_seq'::regclass);


--
-- TOC entry 4907 (class 2604 OID 41131)
-- Name: newsletter_subscriptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.newsletter_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.newsletter_subscriptions_id_seq'::regclass);


--
-- TOC entry 4901 (class 2604 OID 41073)
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- TOC entry 4872 (class 2604 OID 16404)
-- Name: species id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.species ALTER COLUMN id SET DEFAULT nextval('public.species_id_seq'::regclass);


--
-- TOC entry 4897 (class 2604 OID 41032)
-- Name: user_invites id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_invites ALTER COLUMN id SET DEFAULT nextval('public.user_invites_id_seq'::regclass);


--
-- TOC entry 4883 (class 2604 OID 40964)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 4942 (class 2606 OID 16492)
-- Name: contamination_records contamination_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contamination_records
    ADD CONSTRAINT contamination_records_pkey PRIMARY KEY (id);


--
-- TOC entry 4937 (class 2606 OID 16462)
-- Name: daily_operations daily_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_operations
    ADD CONSTRAINT daily_operations_pkey PRIMARY KEY (id);


--
-- TOC entry 4924 (class 2606 OID 16399)
-- Name: employees employees_full_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_full_name_key UNIQUE (full_name);


--
-- TOC entry 4926 (class 2606 OID 16397)
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- TOC entry 4948 (class 2606 OID 32783)
-- Name: inventory_adjustments inventory_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_pkey PRIMARY KEY (id);


--
-- TOC entry 4933 (class 2606 OID 16427)
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- TOC entry 4972 (class 2606 OID 41119)
-- Name: lab_billing_history lab_billing_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lab_billing_history
    ADD CONSTRAINT lab_billing_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4958 (class 2606 OID 40996)
-- Name: labs labs_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.labs
    ADD CONSTRAINT labs_name_key UNIQUE (name);


--
-- TOC entry 4960 (class 2606 OID 40994)
-- Name: labs labs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.labs
    ADD CONSTRAINT labs_pkey PRIMARY KEY (id);


--
-- TOC entry 4975 (class 2606 OID 41145)
-- Name: newsletter_subscriptions newsletter_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.newsletter_subscriptions
    ADD CONSTRAINT newsletter_subscriptions_pkey PRIMARY KEY (id);


--
-- TOC entry 4967 (class 2606 OID 41083)
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 4969 (class 2606 OID 41085)
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- TOC entry 4928 (class 2606 OID 16408)
-- Name: species species_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.species
    ADD CONSTRAINT species_pkey PRIMARY KEY (id);


--
-- TOC entry 4930 (class 2606 OID 16410)
-- Name: species species_species_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.species
    ADD CONSTRAINT species_species_name_key UNIQUE (species_name);


--
-- TOC entry 4946 (class 2606 OID 16494)
-- Name: contamination_records uq_contamination_operation; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contamination_records
    ADD CONSTRAINT uq_contamination_operation UNIQUE (operation_id);


--
-- TOC entry 4935 (class 2606 OID 16429)
-- Name: inventory uq_inventory_species_subculture; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT uq_inventory_species_subculture UNIQUE (lab_id, species_id, subculture_mother_jars);


--
-- TOC entry 4962 (class 2606 OID 41049)
-- Name: user_invites user_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_pkey PRIMARY KEY (id);


--
-- TOC entry 4964 (class 2606 OID 41051)
-- Name: user_invites user_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_token_key UNIQUE (token);


--
-- TOC entry 4950 (class 2606 OID 40981)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4953 (class 2606 OID 40977)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4955 (class 2606 OID 40979)
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- TOC entry 4943 (class 1259 OID 32798)
-- Name: idx_contam_detected_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contam_detected_date ON public.contamination_records USING btree (detected_date);


--
-- TOC entry 4944 (class 1259 OID 16506)
-- Name: idx_contam_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contam_employee ON public.contamination_records USING btree (employee_id);


--
-- TOC entry 4938 (class 1259 OID 32796)
-- Name: idx_daily_ops_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_daily_ops_date ON public.daily_operations USING btree (operations_date);


--
-- TOC entry 4939 (class 1259 OID 16474)
-- Name: idx_daily_ops_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_daily_ops_employee ON public.daily_operations USING btree (employee_id);


--
-- TOC entry 4940 (class 1259 OID 16475)
-- Name: idx_daily_ops_inventory; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_daily_ops_inventory ON public.daily_operations USING btree (inventory_id);


--
-- TOC entry 4931 (class 1259 OID 16435)
-- Name: idx_inventory_species; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_species ON public.inventory USING btree (species_id);


--
-- TOC entry 4970 (class 1259 OID 41125)
-- Name: idx_lab_billing_history_lab_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lab_billing_history_lab_id_created_at ON public.lab_billing_history USING btree (lab_id, created_at DESC);


--
-- TOC entry 4956 (class 1259 OID 41126)
-- Name: idx_labs_stripe_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_labs_stripe_customer_id ON public.labs USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);


--
-- TOC entry 4965 (class 1259 OID 41091)
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- TOC entry 4973 (class 1259 OID 41151)
-- Name: newsletter_subscriptions_lab_email_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX newsletter_subscriptions_lab_email_unique ON public.newsletter_subscriptions USING btree (lab_id, email);


--
-- TOC entry 4951 (class 1259 OID 41155)
-- Name: users_google_sub_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_google_sub_unique ON public.users USING btree (google_sub) WHERE (google_sub IS NOT NULL);


--
-- TOC entry 4999 (class 2620 OID 32795)
-- Name: inventory_adjustments trg_apply_inventory_adjustment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_apply_inventory_adjustment BEFORE INSERT ON public.inventory_adjustments FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_adjustment();


--
-- TOC entry 4996 (class 2620 OID 16519)
-- Name: contamination_records trg_contam_adjust_inventory_del; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_contam_adjust_inventory_del AFTER DELETE ON public.contamination_records FOR EACH ROW EXECUTE FUNCTION public.adjust_inventory_on_contamination();


--
-- TOC entry 4997 (class 2620 OID 16517)
-- Name: contamination_records trg_contam_adjust_inventory_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_contam_adjust_inventory_ins AFTER INSERT ON public.contamination_records FOR EACH ROW EXECUTE FUNCTION public.adjust_inventory_on_contamination();


--
-- TOC entry 4998 (class 2620 OID 16518)
-- Name: contamination_records trg_contam_adjust_inventory_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_contam_adjust_inventory_upd AFTER UPDATE OF contaminated_jars ON public.contamination_records FOR EACH ROW EXECUTE FUNCTION public.adjust_inventory_on_contamination();


--
-- TOC entry 4995 (class 2620 OID 16516)
-- Name: daily_operations trg_daily_ops_inventory; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_daily_ops_inventory BEFORE INSERT ON public.daily_operations FOR EACH ROW EXECUTE FUNCTION public.update_inventory_after_operation();


--
-- TOC entry 4994 (class 2620 OID 16515)
-- Name: inventory trg_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_inventory();


--
-- TOC entry 4982 (class 2606 OID 16500)
-- Name: contamination_records contamination_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contamination_records
    ADD CONSTRAINT contamination_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4983 (class 2606 OID 16495)
-- Name: contamination_records contamination_records_operation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contamination_records
    ADD CONSTRAINT contamination_records_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.daily_operations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4980 (class 2606 OID 16463)
-- Name: daily_operations daily_operations_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_operations
    ADD CONSTRAINT daily_operations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4981 (class 2606 OID 16468)
-- Name: daily_operations daily_operations_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_operations
    ADD CONSTRAINT daily_operations_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4976 (class 2606 OID 41010)
-- Name: employees employees_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE CASCADE;


--
-- TOC entry 4984 (class 2606 OID 32789)
-- Name: inventory_adjustments inventory_adjustments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- TOC entry 4985 (class 2606 OID 32784)
-- Name: inventory_adjustments inventory_adjustments_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- TOC entry 4978 (class 2606 OID 41016)
-- Name: inventory inventory_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE CASCADE;


--
-- TOC entry 4979 (class 2606 OID 16430)
-- Name: inventory inventory_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4992 (class 2606 OID 41120)
-- Name: lab_billing_history lab_billing_history_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lab_billing_history
    ADD CONSTRAINT lab_billing_history_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE CASCADE;


--
-- TOC entry 4993 (class 2606 OID 41146)
-- Name: newsletter_subscriptions newsletter_subscriptions_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.newsletter_subscriptions
    ADD CONSTRAINT newsletter_subscriptions_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE SET NULL;


--
-- TOC entry 4991 (class 2606 OID 41086)
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4977 (class 2606 OID 41004)
-- Name: species species_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.species
    ADD CONSTRAINT species_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE CASCADE;


--
-- TOC entry 4988 (class 2606 OID 41064)
-- Name: user_invites user_invites_accepted_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_accepted_user_id_fkey FOREIGN KEY (accepted_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4989 (class 2606 OID 41057)
-- Name: user_invites user_invites_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4990 (class 2606 OID 41052)
-- Name: user_invites user_invites_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE CASCADE;


--
-- TOC entry 4986 (class 2606 OID 41023)
-- Name: users users_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- TOC entry 4987 (class 2606 OID 40998)
-- Name: users users_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--
