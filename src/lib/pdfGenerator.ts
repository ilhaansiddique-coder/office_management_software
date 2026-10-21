
import { SaleData } from './invoiceTypes';
import { BusinessSettings } from '@/hooks/useBusinessSettings';
import { SystemSettings } from '@/hooks/useSystemSettings';
import { format } from 'date-fns';

const formatCurrency = (amount: number, currencySymbol: string = '৳') => {
    const symbol = currencySymbol === '৳' ? 'Tk ' : currencySymbol;
    return `${symbol}${amount.toLocaleString()}`;
};

const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Failed to load image for PDF', e);
        return null;
    }
};

export const generateInvoicePDFDirect = async (
    sale: SaleData,
    businessSettings: BusinessSettings,
    systemSettings: SystemSettings,
    printOptions: { size: string, orientation: string } = { size: "A4", orientation: "portrait" },
    returnBlob: boolean = false,
    filename?: string
) => {
    // Dynamic imports to optimize bundle size
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    const autoTableModule = await import('jspdf-autotable');

    // Handle autoTable import which might differ based on environment
    const autoTable = autoTableModule.default || (autoTableModule as any);

    // Initialize PDF document (Dynamic format)
    const { size = "A4", orientation = "portrait" } = printOptions;

    const doc = new jsPDF({
        orientation: orientation as any,
        unit: 'mm',
        format: size.toLowerCase() as any
    });

    // Colors
    const brandColor = '#1f8a3b';
    const brandDark = '#0d5a25';
    const textColor = '#0a0a0a';
    const mutedColor = '#666666';

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 10;
    let cursorY = 15;

    // --- Header ---

    // Logo
    if (businessSettings.logo_url) {
        const logoBase64 = await fetchImageAsBase64(businessSettings.logo_url);
        if (logoBase64) {
            try {
                doc.addImage(logoBase64, 'PNG', margin, cursorY, 15, 15);
            } catch (err) {
                console.warn('Error adding logo to PDF:', err);
            }
        }
    }

    // Business Info (Left aligned, next to logo)
    doc.setFontSize(14);
    doc.setTextColor(brandColor);
    doc.setFont('helvetica', 'bold');
    doc.text(businessSettings.business_name || 'Business Name', margin + 20, cursorY + 5);

    doc.setFontSize(8);
    doc.setTextColor(mutedColor);
    doc.setFont('helvetica', 'normal');
    const address = businessSettings.address || businessSettings.address_line1 || '';
    const phone = businessSettings.phone || '';
    const email = businessSettings.email || '';

    doc.text(address, margin + 20, cursorY + 10);
    if (phone || email) {
        doc.text(`${phone} ${email ? '| ' + email : ''}`, margin + 20, cursorY + 14);
    }

    // Invoice Title & Info (Right aligned)
    doc.setFontSize(16);
    doc.setTextColor(brandDark);
    doc.setFont('helvetica', 'bold');
    const title = "INVOICE";
    const titleWidth = doc.getTextWidth(title);
    doc.text(title, pageWidth - margin - titleWidth, cursorY + 5);

    doc.setFontSize(9);
    doc.setTextColor(textColor);
    doc.setFont('helvetica', 'normal');
    const invoiceNum = `# ${sale.invoice_number}`;
    const dateStr = format(new Date(sale.created_at), 'MMM dd, yyyy');

    doc.text(invoiceNum, pageWidth - margin - doc.getTextWidth(invoiceNum), cursorY + 10);
    doc.text(dateStr, pageWidth - margin - doc.getTextWidth(dateStr), cursorY + 14);

    cursorY += 25; // Move down after header

    // --- Customer Info ---
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, cursorY, pageWidth - margin, cursorY); // Divider line
    cursorY += 5;

    doc.setFontSize(8);
    doc.setTextColor(mutedColor);
    doc.text("BILLED TO:", margin, cursorY);

    doc.setFontSize(10);
    doc.setTextColor(textColor);
    doc.setFont('helvetica', 'bold');
    doc.text(sale.customer_name, margin, cursorY + 5);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mutedColor);
    let customerY = cursorY + 9;
    if (sale.customer_phone) {
        doc.text(sale.customer_phone, margin, customerY);
        customerY += 4;
    }
    if (sale.customer_address) {
        const splitAddr = doc.splitTextToSize(sale.customer_address, 80);
        doc.text(splitAddr, margin, customerY);
        customerY += (splitAddr.length * 4);
    }

    cursorY = Math.max(cursorY + 15, customerY + 5);

    // --- Items Table ---
    const tableData = (sale.sale_items || []).map((item, index) => {
        let desc = item.product_name;
        if (item.variant_attributes) {
            // Basic formatting for variants
            const vars = typeof item.variant_attributes === 'string'
                ? item.variant_attributes
                : Object.values(item.variant_attributes || {}).join(', ');
            if (vars) desc += `\n(${vars})`;
        }
        return [
            index + 1,
            desc,
            item.quantity,
            formatCurrency(item.rate, systemSettings.currency_symbol),
            formatCurrency(item.total, systemSettings.currency_symbol)
        ];
    });

    autoTable(doc, {
        startY: cursorY,
        head: [['SL', 'Item', 'Qty', 'Rate', 'Amount']],
        body: tableData,
        theme: 'plain', // Use plain to customize or 'striped'
        headStyles: {
            fillColor: brandColor,
            textColor: '#ffffff',
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 8,
            textColor: textColor
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 'auto' }, // Item desc
            2: { cellWidth: 15, halign: 'center' },
            3: { cellWidth: 20, halign: 'right' },
            4: { cellWidth: 20, halign: 'right' }
        },
        styles: {
            font: 'helvetica',
            cellPadding: 2,
            lineColor: [220, 220, 220],
            lineWidth: 0.1
        },
        margin: { left: margin, right: margin },
    });

    // Calculate position after table
    const finalY = (doc as any).lastAutoTable.finalY + 5;

    // --- Totals Section ---
    const totalsX = pageWidth - margin - 50; // Start totals block
    const valueX = pageWidth - margin; // Align values to right margin
    let currentTotalY = finalY;

    const drawTotalRow = (label: string, value: string, isBold = false) => {
        doc.setFontSize(9);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(isBold ? textColor : mutedColor);
        doc.text(label, totalsX, currentTotalY);

        doc.text(value, valueX, currentTotalY, { align: 'right' });
        currentTotalY += 5;
    };

    drawTotalRow('Subtotal:', formatCurrency(sale.subtotal, systemSettings.currency_symbol));

    if (sale.discount_amount && sale.discount_amount > 0) {
        drawTotalRow('Discount:', `-${formatCurrency(sale.discount_amount, systemSettings.currency_symbol)}`);
    }

    if (sale.courier_name) {
        // Assuming courier charge is part of 'fee' or calculated?
        // simpleInvoiceGenerator.ts uses 'fee'.
        if (sale.fee) {
            drawTotalRow('Delivery:', formatCurrency(sale.fee || 0, systemSettings.currency_symbol));
        }
    }

    // Grand Total
    currentTotalY += 2;
    doc.setDrawColor(200, 200, 200);
    doc.line(totalsX, currentTotalY - 4, pageWidth - margin, currentTotalY - 4);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brandDark);
    doc.text('Grand Total:', totalsX, currentTotalY);
    doc.text(formatCurrency(sale.grand_total, systemSettings.currency_symbol), valueX, currentTotalY, { align: 'right' });
    currentTotalY += 6;

    // Paid / Due
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mutedColor);
    drawTotalRow('Paid:', formatCurrency(sale.amount_paid || 0, systemSettings.currency_symbol));

    if ((sale.amount_due || 0) > 0) {
        doc.setTextColor('#ef4444'); // Red for due
        drawTotalRow('Due:', formatCurrency(sale.amount_due || 0, systemSettings.currency_symbol), true);
    }

    // --- Footer ---
    const footerY = pageHeight - 15;
    doc.setFontSize(8);
    doc.setTextColor(mutedColor);
    doc.setFont('helvetica', 'italic');
    doc.text("Thank you for your business!", pageWidth / 2, footerY, { align: 'center' });

    // Save the PDF
    // Save or Return
    if (returnBlob) {
        return doc.output('blob');
    }
    const finalFilename = filename || `Invoice_${sale.invoice_number}.pdf`;
    doc.save(finalFilename);
};
