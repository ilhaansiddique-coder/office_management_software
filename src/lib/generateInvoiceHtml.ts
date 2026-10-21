import { BusinessSettings } from "@/hooks/useBusinessSettings";
import { SystemSettings } from "@/hooks/useSystemSettings";
import { processInvoiceTemplate, getInvoiceTemplate } from "./invoiceTemplate";
import DOMPurify from 'dompurify';

interface SaleData {
  id: string;
  invoice_number: string;
  created_at: string;
  customer_name: string;
  customer_phone?: string;
  discount_percent?: number;
  discount_amount?: number;
  grand_total: number;
  amount_paid?: number;
  amount_due?: number;
  payment_method: string;
  sale_items?: Array<{
    id: string;
    product_name: string;
    quantity: number;
    rate: number;
    sale_price?: number | null;
    total: number;
    variant_id?: string;
  }>;
}

export const generateInvoiceHtml = (
  sale: SaleData,
  businessSettings: BusinessSettings,
  systemSettings: SystemSettings,
  customTemplate?: string
): string => {
  const template = customTemplate || getInvoiceTemplate();

  return processInvoiceTemplate(
    template,
    sale,
    businessSettings,
    systemSettings
  );
};

export const createPrintableInvoice = (
  sale: SaleData,
  businessSettings: BusinessSettings,
  systemSettings: SystemSettings
): void => {
  const html = generateInvoiceHtml(sale, businessSettings, systemSettings);

  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = () => {
      const fontsReady = (printWindow.document as any).fonts?.ready;
      if (fontsReady && typeof fontsReady.then === 'function') {
        fontsReady.then(() => {
          printWindow.print();
          printWindow.close();
        });
      } else {
        printWindow.print();
        printWindow.close();
      }
    };
  }
};

export const downloadInvoiceHtml = (
  sale: SaleData,
  businessSettings: BusinessSettings,
  systemSettings: SystemSettings,
  filename?: string
): void => {
  const html = generateInvoiceHtml(sale, businessSettings, systemSettings);

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename || `invoice-${sale.invoice_number}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

// Convert HTML to PDF and download using html2canvas and jsPDF
export const downloadInvoicePDFFromHtml = async (
  sale: SaleData,
  businessSettings: BusinessSettings,
  systemSettings: SystemSettings,
  filename?: string
): Promise<void> => {
  // Dynamic imports for better performance
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]);

  const html = generateInvoiceHtml(sale, businessSettings, systemSettings);

  // Create a temporary container for the invoice
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'br', 'hr'],
    ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'colspan', 'rowspan', 'width', 'height']
  });
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '210mm';
  container.style.backgroundColor = 'white';
  container.style.padding = '20px';
  container.style.fontFamily = '"Manrope", ui-sans-serif, system-ui, sans-serif';

  document.body.appendChild(container);

  try {
    // Wait for content to load
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    } else {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Convert HTML to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: 'white',
      width: container.offsetWidth,
      height: container.offsetHeight
    });

    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Calculate dimensions to fit A4
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth - 20; // 10mm margin on each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Add image to PDF
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, pdfHeight - 20));

    // If content is too tall, add more pages
    if (imgHeight > pdfHeight - 20) {
      let position = pdfHeight - 20;
      while (position < imgHeight) {
        pdf.addPage();
        const remainingHeight = imgHeight - position;
        const pageHeight = Math.min(remainingHeight, pdfHeight - 20);

        // Create a new canvas for the remaining content
        const remainingCanvas = document.createElement('canvas');
        const ctx = remainingCanvas.getContext('2d');
        remainingCanvas.width = canvas.width;
        remainingCanvas.height = (pageHeight * canvas.width) / imgWidth;

        ctx?.drawImage(
          canvas,
          0, (position * canvas.width) / imgWidth,
          canvas.width, remainingCanvas.height,
          0, 0,
          remainingCanvas.width, remainingCanvas.height
        );

        const remainingImgData = remainingCanvas.toDataURL('image/png');
        pdf.addImage(remainingImgData, 'PNG', 10, 10, imgWidth, pageHeight);

        position += pageHeight;
      }
    }

    // Download the PDF
    const pdfFilename = filename || `invoice-${sale.invoice_number}.pdf`;
    pdf.save(pdfFilename);

  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
};
