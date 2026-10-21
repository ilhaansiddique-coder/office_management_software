import { supabase } from '@/integrations/supabase/client';

export const ensureStorageBucket = async () => {
  try {
    console.log('Checking if product-images bucket exists...');
    
    // Try to list files from the bucket to see if it exists
    const { data, error } = await supabase.storage
      .from('product-images')
      .list('', { limit: 1 });
    
    if (error) {
      console.error('Storage bucket error:', error);
      
      // If bucket doesn't exist, we need to create it
      if (error.message.includes('Bucket not found') || error.message.includes('404')) {
        console.log('Bucket not found, attempting to create it...');
        return await createStorageBucket();
      }
      
      return false;
    }
    
    console.log('Storage bucket exists and is accessible');
    return true;
  } catch (err) {
    console.error('Error checking storage bucket:', err);
    return false;
  }
};

export const createStorageBucket = async () => {
  try {
    console.warn('Bucket creation is disabled in the client. Use migrations or admin setup.');
    return false;
  } catch (err) {
    console.error('Error creating storage bucket:', err);
    return false;
  }
};

export const testStorageUpload = async () => {
  try {
    // Create a small test file
    const testContent = 'test';
    const testFile = new Blob([testContent], { type: 'text/plain' });
    const testFileName = `test-${Date.now()}.txt`;
    
    console.log('Testing storage upload...');
    
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(testFileName, testFile);
    
    if (error) {
      console.error('Storage upload test failed:', error);
      return false;
    }
    
    console.log('Storage upload test successful:', data);
    
    // Clean up test file
    await supabase.storage
      .from('product-images')
      .remove([testFileName]);
    
    return true;
  } catch (err) {
    console.error('Storage upload test error:', err);
    return false;
  }
};
