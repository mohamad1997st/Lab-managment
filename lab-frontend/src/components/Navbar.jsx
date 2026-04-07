import { useMemo, useState } from 'react';
import {
  AppBar,
  Toolbar,
  Button,
  Typography,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  TextField,
  Paper,
  Menu,
  MenuItem,
  InputAdornment
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/api';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AddIcon from '@mui/icons-material/Add';
import LogoutIcon from '@mui/icons-material/Logout';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SpaIcon from '@mui/icons-material/Spa';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GroupsIcon from '@mui/icons-material/Groups';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BugReportIcon from '@mui/icons-material/BugReport';
import TuneIcon from '@mui/icons-material/Tune';
import DescriptionIcon from '@mui/icons-material/Description';
import InsightsIcon from '@mui/icons-material/Insights';
import ParkIcon from '@mui/icons-material/Park';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import SettingsIcon from '@mui/icons-material/Settings';
import ScienceIcon from '@mui/icons-material/Science';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';

const SIDEBAR_WIDTH = 260;

export default function Navbar({ isAuthenticated, currentUser, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newMenuAnchor, setNewMenuAnchor] = useState(null);

  const role = currentUser?.role || null;
  const isStaff = role === 'staff';

  const navIcons = useMemo(
    () => ({
      Dashboard: DashboardIcon,
      Species: ParkIcon,
      Employees: GroupsIcon,
      Inventory: Inventory2Icon,
      'Daily Operations': AssignmentIcon,
      Contamination: BugReportIcon,
      Adjustments: TuneIcon,
      Reports: DescriptionIcon,
      Performance: InsightsIcon,
      Users: ManageAccountsIcon,
      Newsletter: AlternateEmailIcon,
      'Owner Settings': SettingsIcon,
      Lab: ScienceIcon,
      Subscription: CreditCardIcon
    }),
    []
  );

  const createIcons = useMemo(
    () => ({
      'New Lab User': ManageAccountsIcon,
      'New Species': ParkIcon,
      'New Employee': GroupsIcon,
      'New Inventory': Inventory2Icon,
      'New Operation': AssignmentIcon,
      'New Adjustment': TuneIcon
    }),
    []
  );

  const nav = useMemo(() => {
    if (isStaff) {
      return [
        { label: 'Daily Operations', to: '/daily-operations' },
        { label: 'Contamination', to: '/contamination' },
        { label: 'Adjustments', to: '/inventory-adjustments' },
        { label: 'Performance', to: '/performance' }
      ];
    }

    const shared = [
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Species', to: '/species' },
      { label: 'Employees', to: '/employees' },
      { label: 'Inventory', to: '/inventory' },
      { label: 'Daily Operations', to: '/daily-operations' },
      { label: 'Contamination', to: '/contamination' },
      { label: 'Adjustments', to: '/inventory-adjustments' },
      { label: 'Reports', to: '/reports' },
      { label: 'Performance', to: '/performance' }
    ];

    if (role === 'owner') {
      return [
        { label: 'Lab', to: '/lab' },
        { label: 'Subscription', to: '/subscription' },
        { label: 'Newsletter', to: '/newsletter' },
        { label: 'Owner Settings', to: '/owner-settings' },
        { label: 'Users', to: '/users' },
        ...shared
      ];
    }

    return shared;
  }, [isStaff, role]);

  const filteredNav = nav.filter((item) =>
    item.label.toLowerCase().includes(search.trim().toLowerCase())
  );

  const createActions = isStaff
    ? []
    : [
        ...(role === 'owner' ? [{ label: 'New Lab User', to: '/users' }] : []),
        { label: 'New Species', to: '/species' },
        { label: 'New Employee', to: '/employees' },
        { label: 'New Inventory', to: '/inventory' },
        { label: 'New Operation', to: '/daily-operations' },
        { label: 'New Adjustment', to: '/inventory-adjustments' }
      ];

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout errors and clear client auth state anyway.
    } finally {
      onLogout?.();
      setOpen(false);
      navigate('/login', { replace: true });
    }
  };

  const openNewMenu = (event) => {
    setNewMenuAnchor(event.currentTarget);
  };

  const closeNewMenu = () => {
    setNewMenuAnchor(null);
  };

  const handleCreateNavigation = (to) => {
    closeNewMenu();
    navigate(to);
  };

  const homePath = isStaff ? '/daily-operations' : '/dashboard';

  const sidebarContent = (
    <Box sx={{ width: SIDEBAR_WIDTH, p: 2 }}>
      <Typography variant="overline" sx={{ letterSpacing: 1.2, opacity: 0.7 }}>
        Workspace
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 900, mb: 1.5 }}>
        Navigation
      </Typography>
      <Divider sx={{ mb: 1.5 }} />

      <List sx={{ p: 0 }}>
        {filteredNav.map((item) => {
          const selected = location.pathname === item.to;
          const Icon = navIcons[item.label];
          return (
            <ListItemButton
              key={item.to}
              selected={selected}
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  bgcolor: 'rgba(22, 101, 52, 0.12)',
                  color: '#166534'
                }
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 36,
                  color: selected ? '#166534' : 'rgba(15, 23, 42, 0.65)'
                }}
              >
                {Icon ? <Icon fontSize="small" /> : null}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontWeight: selected ? 900 : 700 }}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{
          borderBottom: '1px solid rgba(148, 163, 184, 0.35)',
          backdropFilter: 'blur(10px)',
          background: 'rgba(255,255,255,0.92)'
        }}
      >
        <Toolbar sx={{ gap: 1.2, flexWrap: 'wrap', py: 1 }}>
          {isAuthenticated && (
            <IconButton
              onClick={() => setOpen(true)}
              sx={{ display: { xs: 'inline-flex', lg: 'none' } }}
              aria-label="Open menu"
            >
              <MenuIcon />
            </IconButton>
          )}

          <Box
            onClick={() => navigate(isAuthenticated ? homePath : '/login')}
            sx={{ cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 180 }}
          >
            <SpaIcon sx={{ color: '#166534' }} />
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: 0.2 }}>
              Mother Roots
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.7, display: { xs: 'none', md: 'inline' } }}>
              Commercial Lab App
            </Typography>
          </Box>

          <TextField
            size="small"
            placeholder="Search sections"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ opacity: 0.65, fontSize: { xs: 22, md: 22, lg: 20 } }} />
                </InputAdornment>
              ),
              endAdornment: search.trim() ? (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                    size="small"
                    sx={{ display: { xs: 'inline-flex', md: 'inline-flex', lg: 'none' } }}
                  >
                    <ClearIcon sx={{ fontSize: { xs: 18, md: 18 } }} />
                  </IconButton>
                </InputAdornment>
              ) : null
            }}
            sx={{
              minWidth: { xs: '100%', md: 280 },
              flexGrow: 1,
              maxWidth: 420,
              bgcolor: '#fff'
            }}
          />

          {isAuthenticated && role === 'owner' && (
            <Button
              variant="outlined"
              onClick={() => navigate('/lab')}
              sx={{ textTransform: 'none', fontWeight: 800 }}
              startIcon={<InfoOutlinedIcon />}
            >
              Lab Information
            </Button>
          )}

          {isAuthenticated && createActions.length > 0 && (
            <Button
              variant="outlined"
              onClick={openNewMenu}
              sx={{ textTransform: 'none', fontWeight: 800 }}
              startIcon={<AddIcon />}
            >
              New
            </Button>
          )}

          <Menu
            anchorEl={newMenuAnchor}
            open={Boolean(newMenuAnchor)}
            onClose={closeNewMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {createActions.map((action) => (
              <MenuItem key={action.to} onClick={() => handleCreateNavigation(action.to)}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {(() => {
                    const Icon = createIcons[action.label];
                    return Icon ? <Icon fontSize="small" /> : <AddIcon fontSize="small" />;
                  })()}
                </ListItemIcon>
                {action.label}
              </MenuItem>
            ))}
          </Menu>

          {!isAuthenticated && (
            <>
              <Button
                variant="outlined"
                onClick={() => navigate('/login')}
                sx={{ textTransform: 'none', fontWeight: 800 }}
                startIcon={<LoginIcon />}
              >
                Login
              </Button>
              <Button
                variant="contained"
                onClick={() => navigate('/login?mode=register')}
                sx={{ textTransform: 'none', fontWeight: 800 }}
                startIcon={<PersonAddAltIcon />}
              >
                Sign Up
              </Button>
            </>
          )}

          {isAuthenticated && (
            <Button
              variant="contained"
              onClick={logout}
              sx={{ textTransform: 'none', fontWeight: 900 }}
              startIcon={<LogoutIcon />}
            >
              Logout
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {isAuthenticated && (
        <>
          <Paper
            elevation={0}
            sx={{
              position: 'fixed',
              top: 88,
              left: 16,
              bottom: 16,
              width: SIDEBAR_WIDTH,
              display: { xs: 'none', lg: 'block' },
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: 3,
              overflow: 'auto',
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
            }}
          >
            {sidebarContent}
          </Paper>

          <Drawer anchor="left" open={open} onClose={() => setOpen(false)} sx={{ display: { lg: 'none' } }}>
            {sidebarContent}
          </Drawer>
        </>
      )}
    </>
  );
}

export { SIDEBAR_WIDTH };
