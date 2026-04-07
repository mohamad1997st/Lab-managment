import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import api from '../api/api';
import ScienceIcon from '@mui/icons-material/Science';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import ParkIcon from '@mui/icons-material/Park';
import GroupsIcon from '@mui/icons-material/Groups';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import DescriptionIcon from '@mui/icons-material/Description';

function StatCard({ label, value, helper }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.25,
        borderRadius: 3,
        border: '1px solid rgba(148, 163, 184, 0.28)',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
      }}
    >
      <Typography variant="overline" sx={{ letterSpacing: 1, opacity: 0.7 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.72, mt: 0.5 }}>
        {helper}
      </Typography>
    </Paper>
  );
}

function ChecklistItem({ done, label }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Chip
        size="small"
        color={done ? 'success' : 'default'}
        label={done ? 'Done' : 'Next'}
        sx={{ minWidth: 56 }}
      />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  );
}

export default function Dashboard({ currentUser }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    lab: null,
    species: [],
    employees: [],
    inventory: [],
    users: [],
    invites: []
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const requests = [
          api.get('/labs/me'),
          api.get('/species'),
          api.get('/employees')
        ];

        if (currentUser?.role !== 'staff') {
          requests.push(api.get('/inventory'));
        }

        if (currentUser?.role === 'owner') {
          requests.push(api.get('/users'));
          requests.push(api.get('/invites'));
        }

        const responses = await Promise.all(requests);

        const nextData = {
          lab: responses[0]?.data || null,
          species: responses[1]?.data || [],
          employees: responses[2]?.data || [],
          inventory: currentUser?.role !== 'staff' ? (responses[3]?.data || []) : [],
          users: [],
          invites: []
        };

        if (currentUser?.role === 'owner') {
          nextData.users = responses[4]?.data || [];
          nextData.invites = responses[5]?.data || [];
        }

        if (active) {
          setData(nextData);
        }
      } catch (e) {
        if (active) {
          setError(e?.response?.data?.error || e.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [currentUser?.role]);

  const summary = useMemo(() => {
    const totalMotherJars = data.inventory.reduce((sum, row) => sum + Number(row.number_mother_jar || 0), 0);
    const pendingInvites = data.invites.filter((invite) => {
      if (invite.status !== 'pending') return false;
      return new Date(invite.expires_at) > new Date();
    }).length;

    return {
      speciesCount: data.species.length,
      employeesCount: data.employees.length,
      inventoryRows: data.inventory.length,
      totalMotherJars,
      usersCount: data.users.length,
      pendingInvites
    };
  }, [data]);

  const checklist = [
    { done: summary.speciesCount > 0, label: 'Add your lab species catalog' },
    { done: summary.employeesCount > 0, label: 'Add employees who work in the lab' },
    { done: summary.inventoryRows > 0, label: 'Create starting inventory rows' },
    { done: currentUser?.role !== 'owner' || summary.usersCount > 1, label: 'Invite or create extra lab users' }
  ];

  const pendingInvites = data.invites
    .filter((invite) => invite.status === 'pending' && new Date(invite.expires_at) > new Date())
    .slice(0, 5);

  const quickActions = currentUser?.role === 'owner'
    ? [
        { label: 'Edit Lab Profile', to: '/lab' },
        { label: 'Manage Users', to: '/users' },
        { label: 'Add Species', to: '/species' },
        { label: 'Add Employee', to: '/employees' }
      ]
    : [
        { label: 'Open Inventory', to: '/inventory' },
        { label: 'Open Species', to: '/species' },
        { label: 'Open Employees', to: '/employees' },
        { label: 'View Reports', to: '/reports' }
      ];

  const quickActionIcons = {
    'Edit Lab Profile': ScienceIcon,
    'Manage Users': ManageAccountsIcon,
    'Add Species': ParkIcon,
    'Add Employee': GroupsIcon,
    'Open Inventory': Inventory2Icon,
    'Open Species': ParkIcon,
    'Open Employees': GroupsIcon,
    'View Reports': DescriptionIcon
  };

  if (loading) {
    return (
      <Stack alignItems="center" spacing={2} sx={{ mt: 8 }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ opacity: 0.7 }}>
          Loading dashboard...
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto', mt: 3, px: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3.5 },
          borderRadius: 4,
          color: '#102a1c',
          background: 'linear-gradient(135deg, #dff4e6 0%, #f6fbf4 45%, #fff8ed 100%)',
          border: '1px solid rgba(22, 101, 52, 0.18)'
        }}
      >
        <Stack spacing={1.25}>
          <Typography variant="overline" sx={{ letterSpacing: 1.4, opacity: 0.72 }}>
            Dashboard
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>
            {data.lab?.name || 'Lab Workspace'}
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: 760, opacity: 0.82 }}>
            {currentUser?.role === 'owner'
              ? 'Track the health of your workspace, complete setup steps, and move quickly into species, employees, inventory, and user management.'
              : 'Use this overview to check lab activity, inventory readiness, and the next sections that need attention.'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ pt: 1 }}>
            {quickActions.map((action) => {
              const Icon = quickActionIcons[action.label];
              return (
                <Button
                  key={action.to}
                  variant="contained"
                  onClick={() => navigate(action.to)}
                  sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, textTransform: 'none', fontWeight: 800 }}
                  startIcon={Icon ? <Icon /> : null}
                >
                  {action.label}
                </Button>
              );
            })}
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard label="Species" value={summary.speciesCount} helper="Catalog items available for production." />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard label="Employees" value={summary.employeesCount} helper="People registered in this lab workspace." />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Inventory Rows"
            value={summary.inventoryRows}
            helper={currentUser?.role === 'staff' ? 'Inventory details are managed by your lab leads.' : 'Distinct species/subculture inventory records.'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            label="Mother Jars"
            value={summary.totalMotherJars}
            helper={currentUser?.role === 'staff' ? 'Visible here as a quick workspace indicator.' : 'Total mother jars currently recorded.'}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148, 163, 184, 0.28)' }}>
            <Stack spacing={1.5}>
              <div>
                <Typography variant="h6" fontWeight={900}>Setup Checklist</Typography>
                <Typography variant="body2" sx={{ opacity: 0.72 }}>
                  A simple guide for making sure this workspace is ready for day-to-day use.
                </Typography>
              </div>
              {checklist.map((item) => (
                <ChecklistItem key={item.label} done={item.done} label={item.label} />
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148, 163, 184, 0.28)', height: '100%' }}>
            <Stack spacing={1.5}>
              <div>
                <Typography variant="h6" fontWeight={900}>Workspace Snapshot</Typography>
                <Typography variant="body2" sx={{ opacity: 0.72 }}>
                  Contact and structure details for this lab.
                </Typography>
              </div>
              <Typography variant="body2"><strong>Email:</strong> {data.lab?.email || 'Not set yet'}</Typography>
              <Typography variant="body2"><strong>Phone:</strong> {data.lab?.phone || 'Not set yet'}</Typography>
              <Typography variant="body2"><strong>Address:</strong> {data.lab?.address || 'Not set yet'}</Typography>
              {currentUser?.role === 'owner' && (
                <Typography variant="body2"><strong>Lab Users:</strong> {summary.usersCount}</Typography>
              )}
              {currentUser?.role === 'owner' && (
                <Typography variant="body2"><strong>Pending Invites:</strong> {summary.pendingInvites}</Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {currentUser?.role === 'owner' && (
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(148, 163, 184, 0.28)' }}>
          <Stack spacing={1.5}>
            <div>
              <Typography variant="h6" fontWeight={900}>Pending Invites</Typography>
              <Typography variant="body2" sx={{ opacity: 0.72 }}>
                Recent outstanding invitations that still need a response.
              </Typography>
            </div>

            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Full Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Expires</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingInvites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>No pending invites right now.</TableCell>
                    </TableRow>
                  ) : (
                    pendingInvites.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell>{invite.full_name}</TableCell>
                        <TableCell>{invite.email}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{invite.role}</TableCell>
                        <TableCell>{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
