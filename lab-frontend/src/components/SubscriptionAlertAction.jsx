import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionAlertAction({ visible = false }) {
  const navigate = useNavigate();

  if (!visible) return null;

  return (
    <Button
      color="inherit"
      size="small"
      onClick={() => navigate('/subscription')}
      sx={{ fontWeight: 800 }}
    >
      Go to Subscription
    </Button>
  );
}
