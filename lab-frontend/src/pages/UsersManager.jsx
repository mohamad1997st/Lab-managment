import { useEffect, useState } from 'react';
import api from '../api/api';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import SendIcon from '@mui/icons-material/Send';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BlockIcon from '@mui/icons-material/Block';
import SaveIcon from '@mui/icons-material/Save';
import PasswordIcon from '@mui/icons-material/Password';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Button,
  Chip,
  Divider,
  Link,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import SubscriptionAlertAction from '../components/SubscriptionAlertAction';
import { APP_ORIGIN } from '../config/api';
import { getFriendlyApiError, hasSubscriptionResolution } from '../utils/subscriptionErrors';

const initialForm = {
  username: '',
  full_name: '',
  email: '',
  password: '',
  role: 'staff'
};

const statusChipColor = {
  pending: 'warning',
  accepted: 'success',
  revoked: 'default',
  expired: 'default'
};

export default function UsersManager() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [userDrafts, setUserDrafts] = useState({});
  const [invites, setInvites] = useState([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteStatusFilter, setInviteStatusFilter] = useState('all');
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', role: 'staff', expires_in_days: 7 });
  const [testEmail, setTestEmail] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSubscriptionAction, setShowSubscriptionAction] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      setShowSubscriptionAction(false);
      const res = await api.get('/users');
      const inviteRes = await api.get('/invites');
      setRows(res.data || []);
      setInvites(inviteRes.data || []);
      setUserDrafts(
        Object.fromEntries(
          (res.data || []).map((row) => [
            row.id,
            {
              username: row.username || '',
              full_name: row.full_name || '',
              email: row.email || '',
              role: row.role || 'staff'
            }
          ])
        )
      );
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      setShowSubscriptionAction(false);
      await api.post('/users', form);
      setForm(initialForm);
      setSuccess('Lab user created successfully.');
      await load();
    } catch (e) {
      setShowSubscriptionAction(hasSubscriptionResolution(e));
      setError(getFriendlyApiError(e, 'create a lab user'));
    } finally {
      setSaving(false);
    }
  };

  const createInvite = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      setInviteFeedback('');
      const res = await api.post('/invites', inviteForm);
      setInviteForm({ full_name: '', email: '', role: 'staff', expires_in_days: 7 });
      const emailStatus = res.data?.email;
      if (emailStatus?.delivered) {
        setSuccess('Invite created and email sent successfully.');
        setInviteFeedback('');
      } else if (emailStatus?.error) {
        setSuccess('Invite created, but the email could not be sent automatically.');
        setInviteFeedback(emailStatus.error);
      } else {
        setSuccess('Invite created. Email sending is not configured yet, so use the invite link below.');
        setInviteFeedback(emailStatus?.reason || 'Email sending is not configured on the backend.');
      }
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async (id) => {
    try {
      setError('');
      setSuccess('');
      await api.put(`/users/${id}`, userDrafts[id]);
      setSuccess('User details updated.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const resetPassword = async (id) => {
    const password = passwordDrafts[id] || '';
    if (!password.trim()) {
      setError('Enter a new password before resetting.');
      return;
    }

    try {
      setError('');
      setSuccess('');
      await api.put(`/users/${id}/password`, { password });
      setPasswordDrafts((prev) => ({ ...prev, [id]: '' }));
      setSuccess('User password reset successfully.');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const removeUser = async (id) => {
    try {
      setError('');
      setSuccess('');
      await api.delete(`/users/${id}`);
      setSuccess('User removed successfully.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const revokeInvite = async (id) => {
    try {
      setError('');
      setSuccess('');
      await api.delete(`/invites/${id}`);
      setSuccess('Invite revoked successfully.');
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const resendInvite = async (id) => {
    try {
      setError('');
      setSuccess('');
      setInviteFeedback('');
      const res = await api.post(`/invites/${id}/resend`);
      const emailStatus = res.data?.email;
      if (emailStatus?.delivered) {
        setSuccess('Invite email sent again successfully.');
        setInviteFeedback('');
      } else if (emailStatus?.error) {
        setSuccess('Resend tried, but the email could not be sent automatically.');
        setInviteFeedback(emailStatus.error);
      } else {
        setSuccess('Invite is still available. Email sending is not configured, so use the invite link.');
        setInviteFeedback(emailStatus?.reason || 'Email sending is not configured on the backend.');
      }
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const sendTestEmail = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      setInviteFeedback('');
      const res = await api.post('/invites/test-email', { email: testEmail });
      const emailStatus = res.data?.email;
      if (emailStatus?.delivered) {
        setSuccess('Test email sent successfully.');
      } else if (emailStatus?.error) {
        setSuccess('Test email request finished, but sending failed.');
        const prefix = emailStatus?.provider ? `[${emailStatus.provider}] ` : '';
        setInviteFeedback(`${prefix}${emailStatus.error}`);
      } else {
        setSuccess('Test email request finished.');
        const prefix = emailStatus?.provider ? `[${emailStatus.provider}] ` : '';
        setInviteFeedback(`${prefix}${emailStatus?.reason || 'Email sending is not configured on the backend.'}`);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const copyInviteLink = async (token) => {
    const inviteUrl = `${APP_ORIGIN}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setSuccess('Invite link copied.');
    } catch {
      setError('Could not copy the invite link automatically.');
    }
  };

  const getInviteStatus = (invite) => {
    if (invite.status !== 'pending') return invite.status;
    const expiresAt = new Date(invite.expires_at);
    return expiresAt <= new Date() ? 'expired' : 'pending';
  };

  const filteredInvites = invites.filter((invite) => {
    const inviteStatus = getInviteStatus(invite);
    const searchNeedle = inviteSearch.trim().toLowerCase();
    const matchesStatus = inviteStatusFilter === 'all' || inviteStatus === inviteStatusFilter;
    const matchesSearch = !searchNeedle ||
      invite.full_name?.toLowerCase().includes(searchNeedle) ||
      invite.email?.toLowerCase().includes(searchNeedle);

    return matchesStatus && matchesSearch;
  });

  return (
    <Paper sx={{ maxWidth: 1100, mx: 'auto', mt: 3, p: 3 }}>
      <Stack spacing={2.5}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <ManageAccountsIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={900}>Lab Users</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Create manager and staff accounts for this lab workspace.
          </Typography>
        </div>

        {error && <Alert severity="error" action={<SubscriptionAlertAction visible={showSubscriptionAction} />}>{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        {inviteFeedback && <Alert severity="info">{inviteFeedback}</Alert>}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            label="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <TextField
            fullWidth
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <TextField
            select
            fullWidth
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <MenuItem value="staff">Staff</MenuItem>
            <MenuItem value="manager">Manager</MenuItem>
          </TextField>
        </Stack>

        <Button
          variant="contained"
          onClick={create}
          disabled={saving || !form.full_name.trim() || !form.email.trim() || !form.password.trim()}
          sx={{ alignSelf: 'flex-start' }}
          startIcon={<PersonAddAltIcon />}
        >
          {saving ? 'Creating...' : 'Create Lab User'}
        </Button>

        <Divider />

        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <SendIcon sx={{ color: '#166534' }} />
            <Typography variant="h6" fontWeight={800}>Test Email</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Send a test message to confirm Gmail SMTP is working before using invites.
          </Typography>
        </div>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            label="Test Email Address"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button
            variant="outlined"
            onClick={sendTestEmail}
            disabled={saving || !testEmail.trim()}
            sx={{ alignSelf: { xs: 'stretch', md: 'center' } }}
            startIcon={<SendIcon />}
          >
            {saving ? 'Sending...' : 'Send Test Email'}
          </Button>
        </Stack>

        <Divider />

        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <MarkEmailReadIcon sx={{ color: '#166534' }} />
            <Typography variant="h6" fontWeight={800}>Invite By Email</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Create an invitation link for a future manager or staff user.
          </Typography>
        </div>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            label="Invite Full Name"
            value={inviteForm.full_name}
            onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
          />
          <TextField
            fullWidth
            label="Invite Email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
          />
          <TextField
            select
            fullWidth
            label="Invite Role"
            value={inviteForm.role}
            onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
          >
            <MenuItem value="staff">Staff</MenuItem>
            <MenuItem value="manager">Manager</MenuItem>
          </TextField>
          <TextField
            select
            fullWidth
            label="Expires In"
            value={inviteForm.expires_in_days}
            onChange={(e) => setInviteForm({ ...inviteForm, expires_in_days: Number(e.target.value) })}
          >
            <MenuItem value={1}>1 day</MenuItem>
            <MenuItem value={7}>7 days</MenuItem>
            <MenuItem value={14}>14 days</MenuItem>
            <MenuItem value={30}>30 days</MenuItem>
          </TextField>
        </Stack>

        <Button
          variant="outlined"
          onClick={createInvite}
          disabled={saving || !inviteForm.full_name.trim() || !inviteForm.email.trim()}
          sx={{ alignSelf: 'flex-start' }}
          startIcon={<MarkEmailReadIcon />}
        >
          {saving ? 'Creating Invite...' : 'Create Invite Link'}
        </Button>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            label="Search Invites"
            placeholder="Search by full name or email"
            value={inviteSearch}
            onChange={(e) => setInviteSearch(e.target.value)}
          />
          <TextField
            select
            fullWidth
            label="Status Filter"
            value={inviteStatusFilter}
            onChange={(e) => setInviteStatusFilter(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="accepted">Accepted</MenuItem>
            <MenuItem value="expired">Expired</MenuItem>
            <MenuItem value="revoked">Revoked</MenuItem>
          </TextField>
        </Stack>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Full Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Accepted User</TableCell>
              <TableCell>Invite Link</TableCell>
              <TableCell align="right">Invite Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>No invites created yet.</TableCell>
              </TableRow>
            ) : filteredInvites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>No invites match the current search or filter.</TableCell>
              </TableRow>
            ) : (
              filteredInvites.map((invite) => {
                const inviteUrl = `${APP_ORIGIN}/invite/${invite.token}`;
                const inviteStatus = getInviteStatus(invite);
                return (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.id}</TableCell>
                    <TableCell>{invite.full_name}</TableCell>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{invite.role}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={inviteStatus}
                        color={statusChipColor[inviteStatus] || 'default'}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      {invite.accepted_user_id ? (
                        <Stack spacing={0.25}>
                          <Typography variant="body2" fontWeight={700}>
                            {invite.accepted_full_name || invite.accepted_username || 'Accepted user'}
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.75 }}>
                            {invite.accepted_username ? `@${invite.accepted_username}` : invite.accepted_email}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="body2" sx={{ opacity: 0.6 }}>
                          Not accepted yet
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {inviteStatus === 'pending' ? (
                        <Link href={inviteUrl} target="_blank" rel="noreferrer">
                          Open Invite
                        </Link>
                      ) : (
                        <Typography variant="body2" sx={{ opacity: 0.6 }}>
                          Closed
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="flex-end">
                        {inviteStatus === 'pending' && (
                          <Button size="small" variant="contained" onClick={() => resendInvite(invite.id)} startIcon={<SendIcon />}>
                            Resend
                          </Button>
                        )}
                        {inviteStatus === 'pending' && (
                          <Button size="small" variant="outlined" onClick={() => copyInviteLink(invite.token)} startIcon={<ContentCopyIcon />}>
                            Copy Link
                          </Button>
                        )}
                        {inviteStatus === 'pending' && (
                          <Button size="small" color="error" variant="outlined" onClick={() => revokeInvite(invite.id)} startIcon={<BlockIcon />}>
                            Revoke
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          </Table>
        </TableContainer>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Full Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Password Reset</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>No lab users added yet.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    <TextField
                      size="small"
                      value={userDrafts[row.id]?.username || ''}
                      onChange={(e) => setUserDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...prev[row.id], username: e.target.value }
                      }))}
                      disabled={row.role === 'owner'}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <TextField
                      size="small"
                      value={userDrafts[row.id]?.full_name || ''}
                      onChange={(e) => setUserDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...prev[row.id], full_name: e.target.value }
                      }))}
                      disabled={row.role === 'owner'}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    <TextField
                      size="small"
                      value={userDrafts[row.id]?.email || ''}
                      onChange={(e) => setUserDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...prev[row.id], email: e.target.value }
                      }))}
                      disabled={row.role === 'owner'}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <TextField
                      select
                      size="small"
                      value={userDrafts[row.id]?.role || row.role}
                      onChange={(e) => setUserDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...prev[row.id], role: e.target.value }
                      }))}
                      disabled={row.role === 'owner'}
                      fullWidth
                    >
                      <MenuItem value="staff">Staff</MenuItem>
                      <MenuItem value="manager">Manager</MenuItem>
                      {row.role === 'owner' && <MenuItem value="owner">Owner</MenuItem>}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ minWidth: 200 }}>
                    {row.role === 'owner' ? (
                      <Typography variant="body2" sx={{ opacity: 0.6 }}>
                        Owner password stays here
                      </Typography>
                    ) : (
                      <TextField
                        size="small"
                        type="password"
                        placeholder="New password"
                        value={passwordDrafts[row.id] || ''}
                        onChange={(e) => setPasswordDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        fullWidth
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="flex-end">
                      {row.role !== 'owner' && (
                        <Button size="small" variant="contained" onClick={() => saveUser(row.id)} startIcon={<SaveIcon />}>
                          Save
                        </Button>
                      )}
                      {row.role !== 'owner' && (
                        <Button size="small" variant="outlined" onClick={() => resetPassword(row.id)} startIcon={<PasswordIcon />}>
                          Reset Password
                        </Button>
                      )}
                      {row.role !== 'owner' && (
                        <Button size="small" color="error" variant="outlined" onClick={() => removeUser(row.id)} startIcon={<DeleteIcon />}>
                          Remove
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Paper>
  );
}
