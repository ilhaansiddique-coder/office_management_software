import { SaleData } from './invoiceTypes';
import { BusinessSettings } from '@/hooks/useBusinessSettings';
import { SystemSettings } from '@/hooks/useSystemSettings';

/**
 * Downloads/shares the invoice as a PDF using the Cash Memo template
 * (the same template shown in the desktop print preview dialog).
 * Uses an isolated iframe + html2canvas for pixel-perfect capture.
 */
export const downloadInvoicePDF = async (
  sale: SaleData,
  businessSettings: BusinessSettings,
  systemSettings: SystemSettings,
  filename?: string,
  returnBlob: boolean = false,
  printOptions: { size: string, orientation: string } = { size: "A4", orientation: "portrait" }
): Promise<Blob | void> => {
  try {
    // Dynamic imports
    const { default: html2canvas } = await import("html2canvas");
    const { default: jsPDF } = await import("jspdf");
    const { generateCashMemoHTML } = await import("./cashMemoTemplate");

    // Determine page dimensions
    const { size = "A4", orientation = "portrait" } = printOptions;
    const isLandscape = orientation === "landscape";
    const dims: Record<string, { w: number; h: number }> = {
      "A4": { w: 210, h: 297 },
      "A5": { w: 148, h: 210 }
    };
    const base = dims[size] || dims["A4"];
    const pageW = isLandscape ? base.h : base.w;
    const pageH = isLandscape ? base.w : base.h;

    // Generate HTML from the Cash Memo template (the one shown in desktop preview)
    const html = generateCashMemoHTML(sale as any, businessSettings, systemSettings);

    // Create hidden iframe for complete style isolation
    // Use pixel dimensions for consistent rendering on mobile
    const pxPerMm = 3.78; // Standard screen resolution conversion
    const iframeWidthPx = Math.ceil(pageW * pxPerMm);
    const iframeHeightPx = Math.ceil(pageH * pxPerMm);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = `${iframeWidthPx}px`;
    iframe.style.height = `${iframeHeightPx}px`;
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      throw new Error("Could not access iframe document");
    }

    // Write the full Cash Memo HTML into the iframe (exactly like window.open does on desktop)
    doc.open();
    doc.write(html);
    doc.close();

    // FORCE PDF MODE to prevent mobile responsive styles from activating
    // (This is critical for A5/A4 pdfs where iframe width might trigger mobile breakpoints)
    if (doc.body) {
      doc.body.classList.add('pdf-mode');
    }

    // Inject minimal PDF-specific overrides
    const overrideStyle = doc.createElement("style");
    overrideStyle.textContent = `
      body {
        background: white !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-items: center !important;
        min-height: auto !important;
        height: auto !important;
      }
      .memo {
        box-shadow: none !important;
        margin: 0 auto !important;
      }
      /* Flexbox items - ensures content is at top */
      .items-grid .grid-row {
        display: flex !important;
        flex-direction: row !important;
        align-items: stretch !important;
        border-bottom: 1px solid var(--line) !important;
      }
      .items-grid .grid-cell {
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-items: stretch !important;
        padding: 1.4mm 1.3mm !important;
        line-height: 1.35 !important;
        border-right: 1px solid var(--line) !important;
        box-sizing: border-box !important;
      }
      .items-grid .grid-cell:last-child {
        border-right: none !important;
      }
      .items-grid .grid-cell.col-sl,
      .items-grid .grid-cell.col-qty,
      .items-grid .grid-cell.col-price,
      .items-grid .grid-cell.col-amount {
        align-items: center !important;
      }
      .items-grid .grid-cell.col-desc {
        align-items: flex-start !important;
      }
      .cell-content {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        line-height: 1.35 !important;
      }
      .desc-clamp {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        line-height: 1.15 !important;
      }
      /* Totals section fix */
      .sum .row {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        align-items: start !important;
      }
      .sum .row .k, .sum .row .v {
        display: flex !important;
        align-items: flex-start !important;
        padding: 2mm !important;
        min-height: 0 !important;
        height: auto !important;
      }
      .sum .row .v {
        justify-content: flex-end !important;
      }
      ::-webkit-scrollbar { display: none; }
    `;
    doc.head.appendChild(overrideStyle);

    // Wait for all resources to load inside the iframe
    await new Promise(resolve => setTimeout(resolve, 300));

    const images = doc.getElementsByTagName("img");
    await Promise.all(Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    // Wait for fonts
    try {
      await iframe.contentDocument?.fonts?.ready;
    } catch (_) { /* some browsers don't support this on iframes */ }

    await new Promise(resolve => setTimeout(resolve, 300));

    // CRITICAL FIX FOR MOBILE: Force all cells to be top-aligned using JavaScript
    // Using flexbox ensures content is at top
    const gridRows = doc.querySelectorAll('.items-grid .grid-row');
    gridRows.forEach((row: any) => {
      row.style.display = 'flex';
      row.style.flexDirection = 'row';
      row.style.alignItems = 'stretch';
      row.style.borderBottom = '1px solid var(--line)';
    });

    const gridCells = doc.querySelectorAll('.items-grid .grid-cell');
    gridCells.forEach((cell: any) => {
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.justifyContent = 'flex-start'; // Content at top!
      cell.style.padding = '1.4mm 1.3mm';
      cell.style.lineHeight = '1.35';
      cell.style.borderRight = '1px solid var(--line)';
      cell.style.boxSizing = 'border-box';
    });

    // Set specific alignment for each column type
    doc.querySelectorAll('.items-grid .grid-cell.col-sl, .items-grid .grid-cell.col-qty, .items-grid .grid-cell.col-price, .items-grid .grid-cell.col-amount').forEach((cell: any) => {
      cell.style.alignItems = 'center';
    });
    doc.querySelectorAll('.items-grid .grid-cell.col-desc').forEach((cell: any) => {
      cell.style.alignItems = 'flex-start';
    });

    // Force cell-content and desc-clamp elements
    const cellContents = doc.querySelectorAll('.cell-content, .desc-clamp');
    cellContents.forEach((el: any) => {
      el.style.display = 'block';
      el.style.margin = '0';
      el.style.padding = '0';
    });

    // Force totals section to align top
    const sumRows = doc.querySelectorAll('.sum .row');
    sumRows.forEach((row: any) => {
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr 1fr';
      row.style.alignItems = 'start';
    });

    const sumCells = doc.querySelectorAll('.sum .row .k, .sum .row .v');
    sumCells.forEach((cell: any) => {
      cell.style.display = 'flex';
      cell.style.alignItems = 'flex-start';
      cell.style.padding = '2mm';
      cell.style.minHeight = '0';
      cell.style.height = 'auto';
    });

    // Force a reflow to ensure styles are applied
    doc.body.offsetHeight;

    await new Promise(resolve => setTimeout(resolve, 400));

    // Capture the iframe body
    const windowWidthPx = Math.ceil(pageW * 3.78);

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "white",
      logging: false,
      windowWidth: windowWidthPx
    });

    // Remove iframe
    document.body.removeChild(iframe);

    // Crop trailing whitespace from bottom
    const ctx = canvas.getContext("2d");
    let cropHeight = canvas.height;
    if (ctx) {
      for (let y = canvas.height - 1; y > 0; y -= 4) {
        const row = ctx.getImageData(0, y, canvas.width, 1).data;
        let hasContent = false;
        for (let x = 0; x < row.length; x += 16) {
          if (row[x] < 250 || row[x + 1] < 250 || row[x + 2] < 250) {
            hasContent = true;
            break;
          }
        }
        if (hasContent) {
          cropHeight = Math.min(canvas.height, y + 40);
          break;
        }
      }
    }

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = canvas.width;
    croppedCanvas.height = cropHeight;
    const croppedCtx = croppedCanvas.getContext("2d");
    if (croppedCtx) {
      croppedCtx.drawImage(canvas, 0, 0, canvas.width, cropHeight, 0, 0, canvas.width, cropHeight);
    }

    // Generate PDF with correct page size
    const contentRatio = croppedCanvas.height / croppedCanvas.width;
    const pageRatio = pageH / pageW;
    const finalH = contentRatio > pageRatio * 1.05 ? (pageW * contentRatio) : pageH;

    const pdf = new jsPDF({
      orientation: orientation as any,
      unit: "mm",
      format: [pageW, finalH]
    });

    const imgData = croppedCanvas.toDataURL("image/png");
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (croppedCanvas.height * imgW) / croppedCanvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, imgW, Math.min(imgH, pdfH));

    if (returnBlob) {
      return pdf.output("blob");
    }

    const finalFilename = filename || `Invoice-${sale.invoice_number}.pdf`;
    pdf.save(finalFilename);

  } catch (error) {
    console.error("PDF generation failed:", error);
    alert("PDF generation failed. Please try again.");
    throw error;
  }
};
