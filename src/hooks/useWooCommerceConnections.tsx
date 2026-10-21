import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/utils/toast";

export interface WooCommerceConnection {
  id: string;
  user_id: string;
  site_name: string;
  site_url: string;
  consumer_key: string;
  consumer_secret: string;
  is_active: boolean;
  last_import_at?: string;
  total_products_imported: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWooCommerceConnectionData {
  site_name: string;
  site_url: string;
  consumer_key: string;
  consumer_secret: string;
}

export interface ImportLog {
  id: string;
  connection_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  total_products: number;
  imported_products: number;
  failed_products: number;
  current_page?: number;
  total_pages?: number;
  error_message?: string;
  progress_message?: string;
  started_at: string;
  completed_at?: string;
}

export const useWooCommerceConnections = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: connections,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["woocommerce-connections", user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Get connections without decrypted credentials for listing
      const { data, error } = await supabase
        .from("woocommerce_connections")
        .select("id, user_id, site_name, site_url, is_active, last_import_at, total_products_imported, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching WooCommerce connections:", error);
        throw error;
      }
      return data as Omit<WooCommerceConnection, 'consumer_key' | 'consumer_secret'>[];
    },
    enabled: !!user?.id,
  });

  const createConnection = useMutation({
    mutationFn: async (connectionData: CreateWooCommerceConnectionData) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Create connection directly in the database
      const { data, error } = await supabase
        .from("woocommerce_connections")
        .insert({
          user_id: user.id,
          site_name: connectionData.site_name,
          site_url: connectionData.site_url,
          consumer_key: connectionData.consumer_key,
          consumer_secret: connectionData.consumer_secret,
          is_active: true,
          total_products_imported: 0
        })
        .select()
        .single();

      if (error) {
        console.error("Database error creating connection:", error);
        throw error;
      }
      
      return { id: data.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["woocommerce-connections", user?.id] });
      toast.success("WooCommerce connection added successfully");
    },
    onError: (error) => {
      toast.error("Failed to add WooCommerce connection");
      console.error("Error creating WooCommerce connection:", error);
    },
  });

  const updateConnection = useMutation({
    mutationFn: async ({ id, ...updateData }: Partial<WooCommerceConnection> & { id: string }) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Update connection directly in the database
      const { data, error } = await supabase
        .from("woocommerce_connections")
        .update({
          site_name: updateData.site_name,
          site_url: updateData.site_url,
          consumer_key: updateData.consumer_key,
          consumer_secret: updateData.consumer_secret,
          is_active: updateData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("user_id", user.id) // Ensure user can only update their own connections
        .select()
        .single();

      if (error) {
        console.error("Database error updating connection:", error);
        throw error;
      }
      
      return { id: data.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["woocommerce-connections", user?.id] });
      toast.success("WooCommerce connection updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update WooCommerce connection");
      console.error("Error updating WooCommerce connection:", error);
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("woocommerce_connections")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["woocommerce-connections", user?.id] });
      toast.success("WooCommerce connection deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete WooCommerce connection");
      console.error("Error deleting WooCommerce connection:", error);
    },
  });

  const startImport = useMutation({
    mutationFn: async (connectionId: string) => {
      let logEntry: any = null;
      
      try {
        // Get the connection details
        const { data: connection, error: connectionError } = await supabase
          .from("woocommerce_connections")
          .select("*")
          .eq("id", connectionId)
          .single();

        if (connectionError || !connection) {
          throw new Error("Connection not found");
        }

        // Create import log entry
        const { data: logData, error: logError } = await supabase
          .from("woocommerce_import_logs")
          .insert({
            connection_id: connectionId,
            status: 'in_progress',
            started_at: new Date().toISOString(),
            progress_message: 'Starting WooCommerce import...'
          })
          .select()
          .single();

        if (logError) {
          console.error("Error creating import log:", logError);
        } else {
          logEntry = logData;
        }

        // Fallback: Use client-side import with proper variation handling
        console.log('Using client-side import fallback due to edge function deployment issues');
        console.log('Connection object:', connection);
        
        // Fetch products from WooCommerce API with pagination
        console.log('About to fetch products from WooCommerce...');
        const products = await fetchWooCommerceProducts(connection);
        console.log('Fetched products:', products.length);
        
        if (products.length === 0) {
          // Update log entry
          await supabase
            .from("woocommerce_import_logs")
            .update({
              status: 'completed',
              total_products: 0,
              imported_products: 0,
              failed_products: 0,
              completed_at: new Date().toISOString(),
              progress_message: 'No products found in WooCommerce'
            })
            .eq("id", logEntry?.id);

          return {
            success: true,
            message: 'No products found in WooCommerce',
            totalProducts: 0,
            importedProducts: 0
          };
        }

        // Import products with variations with progress tracking
        const importResults = await importWooCommerceProductsWithVariations(products, connection, connectionId, logEntry?.id);
        
        // Update log entry with import results
        await supabase
          .from("woocommerce_import_logs")
          .update({
            status: 'completed',
            total_products: products.length,
            imported_products: importResults.imported,
            failed_products: importResults.failed,
            completed_at: new Date().toISOString(),
            progress_message: `Import completed: ${importResults.imported} imported, ${importResults.failed} failed`
          })
          .eq("id", logEntry?.id);

        // Update connection stats
        await supabase
          .from("woocommerce_connections")
          .update({
            total_products_imported: importResults.imported,
            last_import_at: new Date().toISOString()
          })
          .eq("id", connectionId);

        return {
          success: true,
          message: `Successfully imported ${importResults.imported} products`,
          totalProducts: products.length,
          importedProducts: importResults.imported,
          failedProducts: importResults.failed
        };

      } catch (error) {
        console.error("Error starting import:", error);
        
        // Update log entry with error
        if (logEntry?.id) {
          await supabase
            .from("woocommerce_import_logs")
            .update({
              status: 'failed',
              error_message: error.message || 'Unknown error occurred',
              completed_at: new Date().toISOString()
            })
            .eq("id", logEntry.id);
        }

        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Import successful:", data);
      toast.success(data.message, {
        duration: 5000
      });
      queryClient.invalidateQueries({ queryKey: ["woocommerce-connections"] });
    },
    onError: (error) => {
      console.error("Import failed:", error);
      toast.error(`Import failed: ${error.message}`, {
        duration: 5000
      });
    }
  });

  // Helper function to fetch products from WooCommerce API with pagination
  const fetchWooCommerceProducts = async (connection: WooCommerceConnection) => {
    const { site_url, consumer_key, consumer_secret } = connection;
    
    console.log('Starting to fetch WooCommerce products...');
    // Connection details logged for debugging (sensitive data masked)
    if (process.env.NODE_ENV === 'development') {
      // Connection details logged (development only)
    }
    
    try {
      let allProducts: any[] = [];
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const apiUrl = `${site_url}/wp-json/wc/v3/products?consumer_key=${consumer_key}&consumer_secret=${consumer_secret}&per_page=100&page=${page}&status=publish`;
        // API URL logged for debugging (development only)
        if (process.env.NODE_ENV === 'development') {
          // Fetching from WooCommerce API
        }
        
        // Fetch products from WooCommerce REST API with pagination and timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for product fetching
        
        const response = await fetch(apiUrl, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log(`Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error Response:', errorText);
          throw new Error(`WooCommerce API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const products = await response.json();
        console.log(`Fetched ${products.length} products from page ${page}`, products.slice(0, 2)); // Log first 2 products for debugging
        
        if (products.length === 0) {
          hasMorePages = false;
        } else {
          allProducts = [...allProducts, ...products];
          page++;
        }
        
        // Safety check to prevent infinite loops
        if (page > 100) {
          console.warn('Reached maximum page limit (100), stopping pagination');
          break;
        }
      }
      
      console.log(`Total fetched ${allProducts.length} products from WooCommerce`);
      return allProducts;

    } catch (error) {
      console.error("Error fetching WooCommerce products:", error);
      throw new Error(`Failed to fetch products from WooCommerce: ${error.message}`);
    }
  };

  // Helper function to import products to local database with variations
  const importWooCommerceProductsWithVariations = async (products: any[], connection: WooCommerceConnection, connectionId: string, logEntryId?: string) => {
    let imported = 0;
    let failed = 0;

    // Helper function to update progress
    const updateProgress = async (current: number, total: number, message: string) => {
      if (logEntryId) {
        try {
          await supabase
            .from("woocommerce_import_logs")
            .update({
              total_products: total,
              imported_products: current,
              progress_message: message
            })
            .eq("id", logEntryId);
        } catch (error) {
          console.error("Error updating progress:", error);
        }
      }
    };

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const current = i + 1;
      
      // Update progress
      await updateProgress(imported, products.length, `Processing product ${current} of ${products.length}: ${product.name}`);
      try {
        // Check if product already exists
        const { data: existingProduct } = await supabase
          .from("products")
          .select("id")
          .eq("woocommerce_id", product.id)
          .single();

        const productData = {
          name: product.name,
          sku: product.sku || null,
          rate: parseFloat(product.price) || 0,
          cost: parseFloat(product.regular_price) || 0,
          stock_quantity: product.manage_stock ? (product.stock_quantity || 0) : 999,
          low_stock_threshold: 10,
          last_synced_at: new Date().toISOString(),
          woocommerce_connection_id: connectionId,
          image_url: product.images?.[0]?.src || null,
          has_variants: product.variations && product.variations.length > 0,
          size: product.attributes ? product.attributes.find((attr: any) => 
            attr.name.toLowerCase().includes('size'))?.options.join(', ') || null : null,
          color: product.attributes ? product.attributes.find((attr: any) => 
            attr.name.toLowerCase().includes('color') || attr.name.toLowerCase().includes('colour'))?.options.join(', ') || null : null,
        };

        let productId: string;

        if (existingProduct) {
          // Update existing product
          const { error: updateError } = await supabase
            .from("products")
            .update({
              ...productData,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingProduct.id);

          if (updateError) {
            console.error(`Error updating product ${product.name}:`, updateError);
            failed++;
            continue;
          }
          productId = existingProduct.id;
          imported++;
        } else {
          // Create new product
          const { data: newProduct, error: insertError } = await supabase
            .from("products")
            .insert({
              ...productData,
              created_by: user?.id,
              woocommerce_id: product.id,
            })
            .select('id')
            .single();

          if (insertError) {
            console.error(`Error creating product ${product.name}:`, insertError);
            failed++;
            continue;
          }
          productId = newProduct.id;
          imported++;
        }

        // Update progress after successful product import
        await updateProgress(imported, products.length, `Imported product ${current} of ${products.length}: ${product.name}`);

        // Import variations if they exist
        if (product.variations && product.variations.length > 0) {
          console.log(`Importing ${product.variations.length} variations for product ${product.name}`);
          
          for (const variationId of product.variations) {
            try {
              // Fetch variation details from WooCommerce API with timeout
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
              
              const variationResponse = await fetch(
                `${connection.site_url}/wp-json/wc/v3/products/${product.id}/variations/${variationId}?consumer_key=${connection.consumer_key}&consumer_secret=${connection.consumer_secret}`,
                { signal: controller.signal }
              );
              
              clearTimeout(timeoutId);
              
              if (variationResponse.ok) {
                const variation = await variationResponse.json();
                
                const variationData = {
                  product_id: productId,
                  sku: variation.sku || `${product.sku || `wc_${product.id}`}_${variation.id}`,
                  rate: parseFloat(variation.price) || 0,
                  cost: parseFloat(variation.regular_price) || parseFloat(variation.price) || 0,
                  stock_quantity: variation.manage_stock ? (variation.stock_quantity || 0) : 999,
                  low_stock_threshold: 10,
                  image_url: variation.image ? variation.image.src : null,
                  attributes: variation.attributes ? variation.attributes.reduce((acc: any, attr: any) => {
                    acc[attr.name] = attr.option;
                    return acc;
                  }, {}) : {},
                  woocommerce_id: variation.id,
                  woocommerce_connection_id: connectionId,
                  last_synced_at: new Date().toISOString(),
                };

                const { error: variantError } = await supabase
                  .from('product_variants')
                  .upsert(variationData, {
                    onConflict: 'woocommerce_connection_id,woocommerce_id',
                    ignoreDuplicates: false
                  });

                if (variantError) {
                  console.error(`Failed to upsert variation ${variation.id}:`, variantError);
                } else {
                  console.log(`Successfully imported variation ${variation.id}`);
                }
              } else {
                console.error(`Failed to fetch variation ${variationId}: ${variationResponse.status} ${variationResponse.statusText}`);
              }
            } catch (variationError) {
              console.error(`Error importing variation ${variationId}:`, variationError);
            }
          }
        }

        // Update progress after processing product (including variations)
        await updateProgress(imported, products.length, `Completed product ${current} of ${products.length}: ${product.name}`);

      } catch (error) {
        console.error(`Error processing product ${product.name}:`, error);
        failed++;
      }
    }

    return { imported, failed };
  };

  // Helper function to import products to local database (legacy)
  const importWooCommerceProducts = async (products: any[], connectionId: string) => {
    let imported = 0;
    let failed = 0;

    for (const product of products) {
      try {
        // Check if product already exists
        const { data: existingProduct } = await supabase
          .from("products")
          .select("id")
          .eq("woocommerce_id", product.id)
          .single();

        if (existingProduct) {
          // Update existing product
          const { error: updateError } = await supabase
            .from("products")
            .update({
              name: product.name,
              sku: product.sku || null,
              rate: parseFloat(product.price) || 0,
              cost: parseFloat(product.regular_price) || 0,
              stock_quantity: product.stock_quantity || 0,
              low_stock_threshold: 10,
              last_synced_at: new Date().toISOString(),
              woocommerce_connection_id: connectionId,
              image_url: product.images?.[0]?.src || null,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingProduct.id);

          if (updateError) {
            console.error(`Error updating product ${product.name}:`, updateError);
            failed++;
          } else {
            imported++;
          }
        } else {
          // Create new product
          const { error: insertError } = await supabase
            .from("products")
            .insert({
              name: product.name,
              sku: product.sku || null,
              rate: parseFloat(product.price) || 0,
              cost: parseFloat(product.regular_price) || 0,
              stock_quantity: product.stock_quantity || 0,
              low_stock_threshold: 10,
              created_by: user?.id,
              woocommerce_id: product.id,
              woocommerce_connection_id: connectionId,
              last_synced_at: new Date().toISOString(),
              image_url: product.images?.[0]?.src || null,
              has_variants: product.variations && product.variations.length > 0
            });

          if (insertError) {
            console.error(`Error creating product ${product.name}:`, insertError);
            failed++;
          } else {
            imported++;
          }
        }
      } catch (error) {
        console.error(`Error processing product ${product.name}:`, error);
        failed++;
      }
    }

    return { imported, failed };
  };

  return {
    connections,
    isLoading,
    error,
    createConnection: createConnection.mutate,
    isCreating: createConnection.isPending,
    updateConnection: updateConnection.mutate,
    isUpdating: updateConnection.isPending,
    deleteConnection: deleteConnection.mutate,
    isDeleting: deleteConnection.isPending,
    startImport: startImport.mutate,
    isImporting: startImport.isPending,
  };
};

export const useImportLogs = (connectionId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["import-logs", connectionId],
    queryFn: async () => {
      let query = supabase
        .from("woocommerce_import_logs")
        .select(`
          *,
          woocommerce_connections!inner(site_name, site_url)
        `)
        .order("started_at", { ascending: false });

      if (connectionId) {
        query = query.eq("connection_id", connectionId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (ImportLog & { woocommerce_connections: { site_name: string; site_url: string } })[];
    },
    enabled: !!user,
    refetchInterval: (query) => {
      // Refetch every 2 seconds if there are any in-progress imports
      const hasInProgress = query.state.data?.some(log => log.status === 'in_progress' || log.status === 'pending');
      return hasInProgress ? 2000 : false;
    },
  });
};