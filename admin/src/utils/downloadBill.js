// Saving a slip as a PDF.

/** Rasterise at 3× so the small print stays sharp when the PDF is zoomed or printed. */
const SCALE = 3;

/** The printed roll is 80mm wide with a ~4mm margin each side. */
const PDF_WIDTH_MM = 80;

/** `AP-HQ-2609-0039` → `AP-HQ-2609-0039.pdf`, with anything filesystem-hostile stripped. */
const fileName = (billNumber) => `${String(billNumber || 'bill').replace(/[^\w.-]+/g, '-')}.pdf`;

// Renders the mounted slip to a PDF and saves it.
export const downloadBillPdf = async (element, bill) => {
  if (!element) throw new Error('The bill slip is not ready yet.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    // The logo is served from Cloudinary — ask for it cross-origin so it is not
    // dropped from the capture.
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
