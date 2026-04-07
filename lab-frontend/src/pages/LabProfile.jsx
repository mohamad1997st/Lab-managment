import { useEffect, useState } from 'react';
import api from '../api/api';
import {
  Alert,
  Button,
  Paper,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import SaveIcon from '@mui/icons-material/Save';
import { API_ORIGIN } from '../config/api';

const MAX_LOGO_DIMENSION = 512;
const PREVIEW_FRAME_SIZE = 144;
const OUTPUT_LOGO_TYPE = 'image/png';
const OUTPUT_LOGO_QUALITY = 0.92;

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read logo file'));
  reader.readAsDataURL(file);
});

const loadImageElement = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Could not process logo image'));
  image.src = src;
});

const canvasToDataUrl = (canvas, mimeType, quality) => new Promise((resolve, reject) => {
  const toBlob = canvas.toBlob?.bind(canvas);
  if (!toBlob) {
    resolve(canvas.toDataURL(mimeType, quality));
    return;
  }
  toBlob((blob) => {
    if (!blob) {
      reject(new Error('Could not optimize logo image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not optimize logo image'));
    reader.readAsDataURL(blob);
  }, mimeType, quality);
});

const getLogoLayout = ({ image, fitMode, zoomMultiplier, panX = 0, panY = 0, frameSize = MAX_LOGO_DIMENSION }) => {
  const width = Math.max(image.width || 1, 1);
  const height = Math.max(image.height || 1, 1);
  const baseScale = fitMode === 'cover'
    ? Math.max(frameSize / width, frameSize / height)
    : Math.min(frameSize / width, frameSize / height);
  const drawWidth = Math.max(1, Math.round(width * baseScale * zoomMultiplier));
  const drawHeight = Math.max(1, Math.round(height * baseScale * zoomMultiplier));
  const maxOffsetX = Math.max(0, Math.round((drawWidth - frameSize) / 2));
  const maxOffsetY = Math.max(0, Math.round((drawHeight - frameSize) / 2));
  const safePanX = Math.max(-maxOffsetX, Math.min(maxOffsetX, panX));
  const safePanY = Math.max(-maxOffsetY, Math.min(maxOffsetY, panY));

  return {
    drawWidth,
    drawHeight,
    offsetX: Math.round((frameSize - drawWidth) / 2) + safePanX,
    offsetY: Math.round((frameSize - drawHeight) / 2) + safePanY,
    safePanX,
    safePanY
  };
};

const renderLogoPreviewCanvas = ({ image, fitMode, zoomMultiplier, panX = 0, panY = 0 }) => {
  const canvas = document.createElement('canvas');
  canvas.width = MAX_LOGO_DIMENSION;
  canvas.height = MAX_LOGO_DIMENSION;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not optimize logo image');
  }

  const { drawWidth, drawHeight, offsetX, offsetY } = getLogoLayout({
    image,
    fitMode,
    zoomMultiplier,
    panX,
    panY
  });

  context.clearRect(0, 0, MAX_LOGO_DIMENSION, MAX_LOGO_DIMENSION);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  return canvas;
};

const optimizeLogoFile = async (file, { fitMode, zoom, panX, panY }) => {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceDataUrl);
  const canvas = renderLogoPreviewCanvas({
    image,
    fitMode,
    zoomMultiplier: zoom,
    panX,
    panY
  });
  const optimizedDataUrl = await canvasToDataUrl(canvas, OUTPUT_LOGO_TYPE, OUTPUT_LOGO_QUALITY);
  const [, base64Payload] = optimizedDataUrl.split(',');
  if (!base64Payload) {
    throw new Error('Could not optimize logo image');
  }

  const sourceExt = file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name;
  return {
    filename: `${sourceExt || 'lab-logo'}.png`,
    mimeType: OUTPUT_LOGO_TYPE,
    contentBase64: base64Payload,
    previewUrl: optimizedDataUrl
  };
};

export default function LabProfile() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', logo_path: '', logo_url: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [logoFitMode, setLogoFitMode] = useState('contain');
  const [logoZoom, setLogoZoom] = useState(1);
  const [logoPan, setLogoPan] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState(null);
  const [logoSavedNotice, setLogoSavedNotice] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const hasUnsavedPreviewChanges = Boolean(
    logoFile && (
      logoFitMode !== 'contain' ||
      logoZoom !== 1 ||
      logoPan.x !== 0 ||
      logoPan.y !== 0
    )
  );

  useEffect(() => {
    api.get('/labs/me')
      .then((res) => setForm({
        name: res.data?.name || '',
        email: res.data?.email || '',
        phone: res.data?.phone || '',
        address: res.data?.address || '',
        logo_path: res.data?.logo_path || '',
        logo_url: res.data?.logo_url ? `${API_ORIGIN}${res.data.logo_url}` : ''
      }))
      .catch((e) => setError(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!logoFile) {
      setLogoPreviewUrl('');
      return undefined;
    }

    optimizeLogoFile(logoFile, {
      fitMode: logoFitMode,
      zoom: logoZoom,
      panX: logoPan.x,
      panY: logoPan.y
    })
      .then((optimized) => {
        if (!cancelled) {
          setLogoPreviewUrl(optimized.previewUrl);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [logoFile, logoFitMode, logoZoom, logoPan.x, logoPan.y]);

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const res = await api.put('/labs/me', form);
      setForm({
        name: res.data?.name || '',
        email: res.data?.email || '',
        phone: res.data?.phone || '',
        address: res.data?.address || '',
        logo_path: res.data?.logo_path || '',
        logo_url: res.data?.logo_url ? `${API_ORIGIN}${res.data.logo_url}` : form.logo_url
      });
      setSuccess('Lab profile updated.');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async () => {
    if (!logoFile) return;

    try {
      setUploadingLogo(true);
      setError('');
      setSuccess('');
      setLogoSavedNotice('');
      const optimizedLogo = await optimizeLogoFile(logoFile, {
        fitMode: logoFitMode,
        zoom: logoZoom,
        panX: logoPan.x,
        panY: logoPan.y
      });

      const res = await api.post('/labs/me/logo', {
        filename: optimizedLogo.filename,
        mime_type: optimizedLogo.mimeType,
        content_base64: optimizedLogo.contentBase64
      });

      setForm((prev) => ({
        ...prev,
        logo_path: res.data?.logo_path || prev.logo_path,
        logo_url: res.data?.logo_url ? `${API_ORIGIN}${res.data.logo_url}` : prev.logo_url
      }));
      setLogoFile(null);
      setLogoPreviewUrl('');
      setLogoFitMode('contain');
      setLogoZoom(1);
      setLogoPan({ x: 0, y: 0 });
      setDragState(null);
      setLogoSavedNotice('Logo saved to invoice branding.');
      setSuccess('Lab logo uploaded successfully.');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handlePreviewPointerMove = async (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId || !logoFile) return;

    try {
      const image = await loadImageElement(await readFileAsDataUrl(logoFile));
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      const layout = getLogoLayout({
        image,
        fitMode: logoFitMode,
        zoomMultiplier: logoZoom,
        panX: (dragState.originX + deltaX) * (MAX_LOGO_DIMENSION / PREVIEW_FRAME_SIZE),
        panY: (dragState.originY + deltaY) * (MAX_LOGO_DIMENSION / PREVIEW_FRAME_SIZE)
      });
      setLogoPan({ x: layout.safePanX, y: layout.safePanY });
    } catch {
      // Keep the UI stable if image reload fails mid-drag.
    }
  };

  return (
    <Paper sx={{ maxWidth: 900, mx: 'auto', mt: 3, p: 3 }}>
      <Stack spacing={2}>
        <div>
          <Stack direction="row" spacing={1} alignItems="center">
            <ScienceIcon sx={{ color: '#166534' }} />
            <Typography variant="h5" fontWeight={900}>Lab Profile</Typography>
          </Stack>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Manage the commercial profile for this lab workspace.
          </Typography>
        </div>

        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        <TextField
          label="Lab Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          disabled={loading}
        />
        <TextField
          label="Contact Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          disabled={loading}
        />
        <TextField
          label="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          disabled={loading}
        />
        <TextField
          label="Address"
          multiline
          minRows={3}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          disabled={loading}
        />
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
          <Stack spacing={1.5}>
            <div>
              <Typography variant="subtitle1" fontWeight={800}>Lab Logo</Typography>
              <Typography variant="body2" sx={{ opacity: 0.72 }}>
                Upload a PNG, JPG, or WEBP logo. Oversized images are resized and compressed before upload so invoices stay sharp without storing huge files.
              </Typography>
            </div>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Stack spacing={1} sx={{ minWidth: 220 }}>
                <Typography variant="caption" sx={{ opacity: 0.68 }}>
                  Current saved logo
                </Typography>
                <PreviewFrame>
                  {form.logo_url ? (
                    <img
                      src={`${form.logo_url}?t=${encodeURIComponent(form.logo_path || Date.now())}`}
                      alt="Lab logo"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <PreviewPlaceholder label="No logo yet" />
                  )}
                </PreviewFrame>
              </Stack>
              <Stack spacing={1} sx={{ minWidth: 220 }}>
                <Typography variant="caption" sx={{ opacity: 0.68 }}>
                  Invoice header preview
                </Typography>
                <PreviewFrame
                  interactive={Boolean(logoFile && logoPreviewUrl)}
                  onPointerDown={(event) => {
                    if (!logoFile || !logoPreviewUrl) return;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    setDragState({
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: logoPan.x / (MAX_LOGO_DIMENSION / PREVIEW_FRAME_SIZE),
                      originY: logoPan.y / (MAX_LOGO_DIMENSION / PREVIEW_FRAME_SIZE)
                    });
                  }}
                  onPointerMove={handlePreviewPointerMove}
                  onPointerUp={(event) => {
                    if (dragState?.pointerId === event.pointerId) {
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                      setDragState(null);
                    }
                  }}
                  onPointerLeave={(event) => {
                    if (dragState?.pointerId === event.pointerId) {
                      event.currentTarget.releasePointerCapture?.(event.pointerId);
                      setDragState(null);
                    }
                  }}
                >
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="Invoice logo preview"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <PreviewPlaceholder label="Choose a file to preview" />
                  )}
                </PreviewFrame>
                {logoSavedNotice && (
                  <Typography variant="caption" sx={{ color: '#166534', fontWeight: 700 }}>
                    {logoSavedNotice}
                  </Typography>
                )}
              </Stack>
            </Stack>
            <Typography variant="caption" sx={{ opacity: 0.68 }}>
              Saved path: {form.logo_path || 'No uploaded logo yet'}
            </Typography>
            {hasUnsavedPreviewChanges && (
              <Typography variant="caption" sx={{ color: '#b45309', fontWeight: 700 }}>
                Unsaved preview changes
              </Typography>
            )}
            <Button variant="outlined" component="label" disabled={loading || uploadingLogo}>
              {logoFile ? `Selected: ${logoFile.name}` : 'Choose Logo File'}
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => {
                  setError('');
                  setLogoFile(e.target.files?.[0] || null);
                  setLogoPan({ x: 0, y: 0 });
                  setDragState(null);
                }}
              />
            </Button>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={logoFitMode}
              onChange={(_event, nextMode) => {
                if (nextMode) {
                  setLogoFitMode(nextMode);
                  setDragState(null);
                }
              }}
              disabled={loading || uploadingLogo || !logoFile}
            >
              <ToggleButton value="contain">Contain</ToggleButton>
              <ToggleButton value="cover">Cover</ToggleButton>
            </ToggleButtonGroup>
            <Button
              variant="text"
              onClick={() => {
                setLogoPan({ x: 0, y: 0 });
                setDragState(null);
              }}
              disabled={loading || uploadingLogo || !logoFile}
              sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
            >
              Reset Position
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setLogoFitMode('contain');
                setLogoZoom(1);
                setLogoPan({ x: 0, y: 0 });
                setDragState(null);
              }}
              disabled={loading || uploadingLogo || !logoFile}
              sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
            >
              Reset All
            </Button>
            <Stack spacing={0.5}>
              <Typography variant="caption" sx={{ opacity: 0.72 }}>
                Zoom: {logoZoom.toFixed(2)}x
              </Typography>
              <Slider
                min={1}
                max={2}
                step={0.05}
                value={logoZoom}
                onChange={(_event, nextValue) => {
                  setLogoZoom(Array.isArray(nextValue) ? nextValue[0] : nextValue);
                  setDragState(null);
                }}
                disabled={loading || uploadingLogo || !logoFile}
              />
            </Stack>
            {logoFile && logoPreviewUrl && (
              <Typography variant="caption" sx={{ opacity: 0.72 }}>
                Drag inside the preview box to reposition the logo.
              </Typography>
            )}
            <Button
              variant="contained"
              onClick={uploadLogo}
              disabled={loading || uploadingLogo || !logoFile}
            >
              {uploadingLogo ? 'Uploading Logo...' : (hasUnsavedPreviewChanges ? 'Save Logo Changes' : 'Upload Logo')}
            </Button>
          </Stack>
        </Paper>
        <Button variant="contained" onClick={save} disabled={loading || saving} startIcon={<SaveIcon />}>
          {saving ? 'Saving...' : 'Save Lab Profile'}
        </Button>
      </Stack>
    </Paper>
  );
}

function PreviewFrame({ children, interactive = false, ...props }) {
  return (
    <div
      {...props}
      style={{
        width: PREVIEW_FRAME_SIZE,
        height: PREVIEW_FRAME_SIZE,
        borderRadius: 16,
        border: '1px solid rgba(148, 163, 184, 0.28)',
        background: 'linear-gradient(180deg, #f8fafc, #ffffff)',
        padding: 12,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: interactive ? 'grab' : 'default',
        touchAction: interactive ? 'none' : 'auto'
      }}
    >
      {children}
    </div>
  );
}

function PreviewPlaceholder({ label }) {
  return (
    <Typography variant="caption" sx={{ opacity: 0.6, textAlign: 'center' }}>
      {label}
    </Typography>
  );
}
