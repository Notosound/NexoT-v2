import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Código QR en SVG (se genera en el navegador, no se envía a ningún servicio) */
export default function QR({ texto }: { texto: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(texto, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1a1a2e', light: '#ffffff' } })
      .then(setSvg).catch(() => setSvg(''));
  }, [texto]);
  return <div className="qr" role="img" aria-label="Código QR del enlace" dangerouslySetInnerHTML={{ __html: svg }} />;
}
