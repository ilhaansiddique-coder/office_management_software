import { useLocation } from 'react-router-dom';

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/sales': 'Sales',
  '/packaging': 'Packaging',
  '/customers': 'Customers',
  '/reports': 'Reports',
  '/reports/case-study-sales-2026': 'Sales Case Study',
  '/invoices': 'Invoices',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
  '/admin': 'Business Administration',
  '/profile': 'Profile',
};

export const useCurrentPageTitle = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  
  // Handle admin sub-routes
  if (currentPath.startsWith('/admin')) {
    return 'Business Administration';
  }
  if (currentPath.startsWith('/users/')) {
    return 'User Profile';
  }
  
  return routeTitles[currentPath] || 'Page';
};

