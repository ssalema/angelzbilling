/** Render at 3x so small print stays sharp when zoomed or printed. */
const SCALE = 3;

/** 80mm thermal roll (~4mm margin each side). */
const PDF_WIDTH_MM = 80;

/** Bill number as a safe file name, e.g. `AP-HQ-2609-0039.pdf`. */
const fileName = (billNumber) => `${String(billNumber || 'bill').replace(/[^\w.-]+/g, '-')}.pdf`;

export const downloadBillPdf = async (element, bill) => {
  if (!element) throw new Error('The bill slip is not ready yet.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    // Load the Cloudinary logo with CORS so it is not dropped from the capture.
    useCORS: true,
    logging: false,
  });

  const heightMm = (canvas.height / canvas.width) * PDF_WIDTH_MM;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PDF_WIDTH_MM, heightMm],
    compress: true,
  });

  pdf.setProperties({ title: `Bill ${bill?.billNumber || ''}` });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, PDF_WIDTH_MM, heightMm);
  pdf.save(fileName(bill?.billNumber));
};
