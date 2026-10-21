import fs from "fs";

const SUPABASE_URL = "https://supabase.inventra.site";
const SUPABASE_ANON_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3MTEyNDU4MCwiZXhwIjo0OTI2Nzk4MTgwLCJyb2xlIjoiYW5vbiJ9.FmQDLsYbt6pNhSWyKGpMFuDNvEJ9keOBZrwO1DeE0Is";

async function checkAllCreditInvoices() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/sales?select=customer_name,invoice_number,amount_due,review_amount_due,payment_terms,payment_method,courier_status`, {
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (!response.ok) {
            console.error("HTTP error", response.status, await response.text());
            return;
        }

        const data = await response.json();

        const creditSales = data.filter(s => {
            const terms = (s.payment_terms || "").toLowerCase() === "credit";
            const method = (s.payment_method || "").toLowerCase() === "credit";
            return terms || method;
        });

        console.log("Total credit invoices (regardless of due amount):", creditSales.length);

        if (creditSales.length > 0) {
            console.log("Here are the customers with ANY credit invoices ever:");
            const uniqueCustomers = new Map();
            for (const sale of creditSales) {
                if (!uniqueCustomers.has(sale.customer_name)) {
                    uniqueCustomers.set(sale.customer_name, 0);
                }
                const amountDue = Math.max(0, sale.review_amount_due ?? sale.amount_due ?? 0);
                uniqueCustomers.set(sale.customer_name, uniqueCustomers.get(sale.customer_name) + amountDue);
            }
            console.log(Object.fromEntries(uniqueCustomers));
        } else {
            // let's see some random sales to see format
            console.log("Sample 3 sales terms:", data.slice(0, 3).map(s => s.payment_terms));
        }

    } catch (err) {
        console.error("Error:", err);
    }
}

checkAllCreditInvoices();
