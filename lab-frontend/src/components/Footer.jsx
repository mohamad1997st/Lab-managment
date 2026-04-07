import { useMemo, useState } from 'react';
import { Alert, Box, Button, Divider, Link, Stack, TextField, Typography } from '@mui/material';
import SpaIcon from '@mui/icons-material/Spa';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import api from '../api/api';

export default function Footer({ showAppChrome, currentLab, currentUser }) {
  const year = new Date().getFullYear();
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribeMessage, setSubscribeMessage] = useState('');
  const [subscribeError, setSubscribeError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const contact = useMemo(() => {
    const email = currentLab?.email || currentUser?.email || '';
    const phone = currentLab?.phone || '';
    const address = currentLab?.address || '';

    return { email, phone, address };
  }, [currentLab, currentUser]);

  const handleNewsletterSubmit = async (event) => {
    event.preventDefault();
    setSubscribeMessage('');
    setSubscribeError('');

    if (!newsletterEmail.trim()) {
      setSubscribeError('Enter an email address to request newsletter access.');
      return;
    }

    const submittedEmail = newsletterEmail.trim();

    try {
      setSubmitting(true);
      await api.post('/newsletter/subscribe', {
        email: submittedEmail,
        lab_id: currentLab?.id ?? null,
        source: 'footer'
      });
      setSubscribeMessage(`Thanks. ${submittedEmail} has been saved for newsletter updates.`);
      setNewsletterEmail('');
    } catch (error) {
      setSubscribeError(error.response?.data?.error || 'Could not save your subscription right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      component="footer"
      sx={{
        maxWidth: 1200,
        mx: 'auto',
        mt: 4,
        px: 2,
        pb: showAppChrome ? 0 : 3
      }}
    >
      <Box
        sx={{
          borderRadius: 3,
          border: '1px solid rgba(148, 163, 184, 0.26)',
          background: 'linear-gradient(180deg, rgba(22, 101, 52, 0.08), rgba(255, 255, 255, 0.98))',
          px: { xs: 2, md: 3 },
          py: 2.5
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', lg: 'flex-start' }}
          justifyContent="space-between"
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <SpaIcon sx={{ color: '#166534', fontSize: 22 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 900, letterSpacing: 0.2 }}>
                Mother Roots
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ mt: 1, maxWidth: 420, color: 'text.secondary', lineHeight: 1.7 }}>
              Professional lab management for inventory, production tracking, reporting, and organized team workflows.
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: 'text.secondary', fontWeight: 700 }}>
              Built for organized daily production
            </Typography>
          </Box>

          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              p: 2,
              borderRadius: 2.5,
              border: '1px solid rgba(148, 163, 184, 0.2)',
              backgroundColor: 'rgba(255,255,255,0.72)'
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1.2 }}>
              Contact Us
            </Typography>
            <Stack spacing={1.1}>
              <Stack direction="row" spacing={1.2} alignItems="flex-start">
                <EmailOutlinedIcon sx={{ color: '#166534', fontSize: 20, mt: 0.1 }} />
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700 }}>
                    Email
                  </Typography>
                  {contact.email ? (
                    <Link href={`mailto:${contact.email}`} underline="hover" color="inherit">
                      {contact.email}
                    </Link>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Add a lab email in Lab Profile to display contact details here.
                    </Typography>
                  )}
                </Box>
              </Stack>

              <Stack direction="row" spacing={1.2} alignItems="flex-start">
                <PhoneOutlinedIcon sx={{ color: '#166534', fontSize: 20, mt: 0.1 }} />
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700 }}>
                    Phone
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {contact.phone || 'Add a lab phone number for direct support requests.'}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1.2} alignItems="flex-start">
                <PlaceOutlinedIcon sx={{ color: '#166534', fontSize: 20, mt: 0.1 }} />
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700 }}>
                    Address
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {contact.address || 'Add a lab address if you want visitors to see your location.'}
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          </Box>

          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              p: 2,
              borderRadius: 2.5,
              border: '1px solid rgba(22, 101, 52, 0.18)',
              background: 'linear-gradient(180deg, rgba(240, 253, 244, 0.95), rgba(255, 255, 255, 0.88))'
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <CampaignOutlinedIcon sx={{ color: '#166534', fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Subscribe to News
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5, lineHeight: 1.7 }}>
              Let visitors request updates, release notes, and product news from your team.
            </Typography>

            <Box component="form" onSubmit={handleNewsletterSubmit}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  type="email"
                  size="small"
                  fullWidth
                  placeholder="Enter your email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  disabled={submitting}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={submitting}
                  sx={{ minWidth: { sm: 140 }, fontWeight: 800, textTransform: 'none' }}
                >
                  {submitting ? 'Saving...' : 'Subscribe'}
                </Button>
              </Stack>
            </Box>

            <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
              Email addresses are stored in the backend so your team can review newsletter interest later.
            </Typography>

            {subscribeMessage && (
              <Alert severity="success" sx={{ mt: 1.5 }}>
                {subscribeMessage}
              </Alert>
            )}

            {subscribeError && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                {subscribeError}
              </Alert>
            )}
          </Box>
        </Stack>

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          (c) {year} Mother Roots. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}
