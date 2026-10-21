import fs from 'fs';

const data = fs.readFileSync('Backups/2026-02-16_21-56/data.sql', 'utf8');

// The SQL dump contains COPY commands. We want to find customers or sales with credit.
// A simpler way: we can regex match sales where payment_terms or payment_method contains 'credit'
// The structure of COPY public.sales is:
// id, customer_id, customer_name, ..., payment_method, payment_terms, amount_due, ...

const salesLines = data.split('\n');
let insideSales = false;

for (let i = 0; i < salesLines.length; i++) {
    const line = salesLines[i];
    if (line.startsWith('COPY public.sales ')) {
        insideSales = true;
        continue;
    }
    if (insideSales) {
        if (line === '\\.') {
            insideSales = false;
            break;
        }

        // This is a TSV line basically. Let's just do a basic check if the line has credit 
        if (line.toLowerCase().includes('credit')) {
            const cols = line.split('\t');
            // Usually customer_name is the 3rd or 4th column. Or we can just print the whole line
            const customerName = cols[2];
            console.log("Found credit sale for:", customerName, "Full line length:", line.length);
        }
    }
}
