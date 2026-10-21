const fs = require('fs');
const path = require('path');

// List of files to update
const filesToUpdate = [
  'src/components/admin/UserManagement.tsx',
  'src/components/ImagePicker.tsx',
  'src/components/ImageUpload.tsx',
  'src/pages/Invoices.tsx',
  'src/pages/Alerts.tsx',
  'src/pages/Reports.tsx',
  'src/pages/Customers.tsx',
  'src/pages/Sales.tsx',
  'src/components/SaleDetailsDialog.tsx',
  'src/components/BaseSaleDialog.tsx',
  'src/components/ManualCourierStatusSelector.tsx',
  'src/hooks/useBusinessSettings.tsx',
  'src/hooks/useCustomSettings.tsx',
  'src/hooks/useCustomers.tsx',
  'src/hooks/useSales.tsx',
  'src/components/DataBackupControls.tsx',
  'src/components/CourierOrderDialog.tsx',
  'src/components/CourierWebhookSettings.tsx',
  'src/components/BusinessTab.tsx',
  'src/hooks/useWebhookSettings.tsx',
  'src/hooks/useProductVariants.tsx',
  'src/components/WooCommerceImport.tsx',
  'src/components/StockAdjustmentDialog.tsx',
  'src/components/EditSaleDialog.tsx',
  'src/hooks/useProfile.tsx',
  'src/hooks/useCustomerStatusUpdate.tsx',
  'src/hooks/useCourierStatusRealtime.tsx',
  'src/components/FirstTimeSetup.tsx',
  'src/components/AdminRecovery.tsx',
  'src/hooks/useSystemSettings.tsx',
  'src/hooks/useUserPreferences.tsx',
  'src/hooks/useWooCommerceLiveSync.tsx',
  'src/hooks/useStopImport.tsx',
  'src/hooks/useStopSync.tsx',
  'src/components/SecurityTab.tsx'
];

filesToUpdate.forEach(filePath => {
  try {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace sonner toast imports with our enhanced toast
      content = content.replace(
        /import\s*{\s*toast\s*}\s*from\s*["']sonner["']/g,
        'import { toast } from "@/utils/toast"'
      );
      
      content = content.replace(
        /import\s*toast\s*from\s*["']sonner["']/g,
        'import { toast } from "@/utils/toast"'
      );
      
      fs.writeFileSync(filePath, content);
      console.log(`Updated: ${filePath}`);
    } else {
      console.log(`File not found: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error.message);
  }
});

console.log('Toast import updates completed!');
