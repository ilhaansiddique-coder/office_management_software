
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/utils/toast";
import { parseVariantAttributes } from "@/utils/variantAttributes";
import { useEffect } from "react";

export interface VariantAttributes {
  [key: string]: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  attributes: VariantAttributes;
  sku: string | null;
  rate: number | null;
  cost: number | null;
  stock_quantity: number;
  low_stock_threshold: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttributeDefinition {
  name: string;
  values: string[];
}

// Helper function to normalize attributes for consistent comparison
const normalizeAttributes = (attrs: VariantAttributes): string => {
  const sorted = Object.keys(attrs)
    .sort()
    .reduce((acc, key) => {
      acc[key] = attrs[key];
      return acc;
    }, {} as VariantAttributes);
  return JSON.stringify(sorted);
};

export const useProductVariants = (productId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: variants = [], isLoading, refetch } = useQuery({
    queryKey: ["product_variants", productId],
    queryFn: async () => {
      if (!productId) return [] as ProductVariant[];
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const parsed = (data as ProductVariant[]).map((variant) => ({
        ...variant,
        attributes: parseVariantAttributes(variant.attributes),
      }));
      return parsed;
    },
    enabled: !!user && !!productId,
    staleTime: 0, // Always consider data stale so it refetches when invalidated
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user || !productId) return;
    const channel = supabase
      .channel(`product-variants-${productId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_variants", filter: `product_id=eq.${productId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["product_variants", productId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, productId, user]);

  const bulkUpsert = useMutation({
    mutationFn: async (params: {
      productId: string;
      hasVariants: boolean;
      attributes?: AttributeDefinition[];
      variants: Omit<ProductVariant, "id" | "created_at" | "updated_at">[];
    }) => {
      const { productId, hasVariants, attributes = [], variants } = params;

      console.log("Bulk upsert called with:", { productId, hasVariants, variants: variants.length });

      // 1) Update product has_variants flag FIRST
      const { error: updProdErr } = await supabase
        .from("products")
        .update({ has_variants: hasVariants })
        .eq("id", productId);
      if (updProdErr) {
        console.error("Error updating product has_variants:", updProdErr);
        throw updProdErr;
      }

      // 2) Handle attributes if provided
      if (attributes && attributes.length > 0) {
        console.log("Processing attributes for product:", productId, "Attributes:", attributes);

        // Validate attributes before processing
        const validAttributes = attributes.filter(attr =>
          attr.name && attr.name.trim() &&
          (!attr.values || Array.isArray(attr.values))
        );

        if (validAttributes.length === 0) {
          console.warn("No valid attributes provided");
          return true;
        }

        console.log("Valid attributes to process:", validAttributes);

        // Get existing attributes with their values
        console.log(`Fetching existing attributes for product: ${productId}`);
        const { data: existingAttrs, error: existingAttrsError } = await supabase
          .from("product_attributes")
          .select(`
            id,
            name,
            product_attribute_values (
              id,
              value
            )
          `)
          .eq("product_id", productId);

        if (existingAttrsError) {
          console.error("Error fetching existing attributes:", existingAttrsError);
          throw new Error(`Failed to fetch existing attributes: ${existingAttrsError.message}`);
        }

        console.log(`Found ${existingAttrs?.length || 0} existing attributes:`, existingAttrs);

        // Create a map of existing attributes for quick lookup (case-insensitive)
        const existingAttrsMap = new Map(
          existingAttrs?.map(attr => [
            attr.name.toLowerCase().trim(),
            {
              id: attr.id,
              name: attr.name, // Keep original name for reference
              existingValues: new Set(attr.product_attribute_values?.map((v: any) => v.value) || [])
            }
          ]) || []
        );

        console.log(`Created existingAttrsMap with keys:`, Array.from(existingAttrsMap.keys()));

        // Process each attribute
        for (const attr of validAttributes) {
          try {
            const normalizedAttrName = attr.name.toLowerCase().trim();
            console.log(`Processing attribute: "${attr.name}" (normalized: "${normalizedAttrName}")`);
            const existingAttr = existingAttrsMap.get(normalizedAttrName) as any;
            console.log(`Existing attribute lookup result:`, existingAttr);
            let attrId = existingAttr?.id;

            if (!existingAttr) {
              // Create new attribute
              console.log(`Creating new attribute: ${attr.name} for product: ${productId}`);

              const { data: attrRow, error: insAttrErr } = await supabase
                .from("product_attributes")
                .insert({ product_id: productId, name: attr.name })
                .select("id")
                .single();

              if (insAttrErr) {
                console.error(`Failed to create attribute ${attr.name}:`, insAttrErr);
                // Check if it's a duplicate key error
                if (insAttrErr.code === '23505') {
                  console.log(`Attribute ${attr.name} already exists, fetching existing ID...`);
                  // Try to fetch the existing attribute
                  const { data: existingAttrData, error: fetchErr } = await supabase
                    .from("product_attributes")
                    .select("id")
                    .eq("product_id", productId)
                    .eq("name", attr.name)
                    .single();

                  if (fetchErr) {
                    console.warn(`Failed to fetch existing attribute '${attr.name}': ${fetchErr.message}`);
                    // Try one more time with a different approach - refresh the map
                    console.log(`Refreshing attributes map and retrying...`);
                    const { data: refreshedAttrs } = await supabase
                      .from("product_attributes")
                      .select("id, name")
                      .eq("product_id", productId);

                    const refreshedAttr = refreshedAttrs?.find(a =>
                      a.name.toLowerCase().trim() === normalizedAttrName
                    );

                    if (refreshedAttr) {
                      attrId = refreshedAttr.id;
                      console.log(`Found attribute ${attr.name} after refresh with ID: ${attrId}`);
                    } else {
                      console.warn(`Still cannot find attribute '${attr.name}', skipping`);
                      continue;
                    }
                  } else {
                    attrId = existingAttrData.id;
                    console.log(`Found existing attribute ${attr.name} with ID: ${attrId}`);
                  }
                } else {
                  console.warn(`Failed to create attribute '${attr.name}': ${insAttrErr.message}`);
                  // Skip this attribute instead of throwing an error
                  continue;
                }
              } else {
                attrId = attrRow.id;
                console.log(`Successfully created attribute ${attr.name} with ID: ${attrId}`);
              }
            } else {
              console.log(`Attribute ${attr.name} already exists with ID: ${attrId}`);
            }

            // Handle attribute values
            if (attr.values?.length && attrId) {
              // Filter out values that already exist
              const newValues = attr.values.filter(value =>
                !(existingAttr?.existingValues as Set<string>)?.has(value)
              );

              if (newValues.length > 0) {
                console.log(`Adding ${newValues.length} new values for attribute ${attr.name}:`, newValues);
                const vals = newValues.map((v) => ({ attribute_id: attrId, value: v }));
                const { error: insValsErr } = await supabase
                  .from("product_attribute_values")
                  .insert(vals);
                if (insValsErr) {
                  console.error(`Failed to create attribute values for ${attr.name}:`, insValsErr);
                  // Check if it's a duplicate key error - if so, just log and continue
                  if (insValsErr.code === '23505') {
                    console.log(`Some values for attribute ${attr.name} already exist, skipping duplicates`);
                  } else {
                    console.warn(`Failed to create attribute values for '${attr.name}': ${insValsErr.message}`);
                    // Continue processing instead of throwing an error
                  }
                } else {
                  console.log(`Successfully added new values for attribute ${attr.name}`);
                }
              } else {
                console.log(`All values for attribute ${attr.name} already exist, skipping`);
              }
            }
          } catch (error) {
            console.error(`Error processing attribute ${attr.name}:`, error);
            // Log the error but continue processing other attributes
            console.warn(`Skipping attribute ${attr.name} due to error:`, error);
          }
        }
      }

      // 3) Clean up unused attribute values and attributes
      if (attributes && attributes.length > 0) {
        // Get all existing attributes again after processing
        const { data: finalAttrs } = await supabase
          .from("product_attributes")
          .select(`
            id,
            name,
            product_attribute_values (
              id,
              value
            )
          `)
          .eq("product_id", productId);

        if (finalAttrs) {
          // Create a set of valid attribute names (case-insensitive)
          const validAttrNames = new Set(attributes.map(a => a.name.toLowerCase().trim()));

          // Create a set of valid attribute value combinations
          const validAttrValueMap = new Map<string, Set<string>>();
          attributes.forEach(attr => {
            const normalizedName = attr.name.toLowerCase().trim();
            validAttrValueMap.set(normalizedName, new Set(attr.values || []));
          });

          // Clean up unused attribute values and attributes
          for (const attr of finalAttrs) {
            const normalizedName = attr.name.toLowerCase().trim();

            // If attribute is no longer valid, delete it and all its values
            if (!validAttrNames.has(normalizedName)) {
              console.log(`Deleting unused attribute: ${attr.name}`);
              const attrValues = attr.product_attribute_values || [];
              if (attrValues.length > 0) {
                const { error: delValsErr } = await supabase
                  .from("product_attribute_values")
                  .delete()
                  .in("id", attrValues.map((v: any) => v.id));
                if (delValsErr) console.warn(`Error deleting values for attribute ${attr.name}:`, delValsErr);
              }
              const { error: delAttrErr } = await supabase
                .from("product_attributes")
                .delete()
                .eq("id", attr.id);
              if (delAttrErr) console.warn(`Error deleting attribute ${attr.name}:`, delAttrErr);
            } else {
              // Attribute is still valid, but check for unused values
              const validValues = validAttrValueMap.get(normalizedName) || new Set();
              const attrValues = attr.product_attribute_values || [];
              const unusedValues = attrValues.filter((v: any) => !validValues.has(v.value));

              if (unusedValues.length > 0) {
                console.log(`Deleting ${unusedValues.length} unused values for attribute ${attr.name}`);
                const { error: delValsErr } = await supabase
                  .from("product_attribute_values")
                  .delete()
                  .in("id", unusedValues.map((v: any) => v.id));
                if (delValsErr) console.warn(`Error deleting unused values for attribute ${attr.name}:`, delValsErr);
              }
            }
          }
        }
      } else if (attributes && attributes.length === 0) {
        // If no attributes provided but product has variants, clean up all attributes
        const { data: existingAttrs } = await supabase
          .from("product_attributes")
          .select("id")
          .eq("product_id", productId);

        if (existingAttrs && existingAttrs.length > 0) {
          // Delete all attribute values first
          const { error: delValsErr } = await supabase
            .from("product_attribute_values")
            .delete()
            .in("attribute_id", existingAttrs.map((r: any) => r.id));
          if (delValsErr) console.warn("Error deleting attribute values:", delValsErr);

          // Then delete all attributes
          const { error: delAttrsErr } = await supabase
            .from("product_attributes")
            .delete()
            .eq("product_id", productId);
          if (delAttrsErr) console.warn("Error deleting attributes:", delAttrsErr);
        }
      }

      // 4) Handle variants if provided
      if (variants.length > 0) {
        // Normalize attributes for consistent comparison
        const normalizedVariants = variants.map(v => ({
          ...v,
          normalizedAttributes: normalizeAttributes(v.attributes)
        }));

        // Deduplicate variants by normalized attributes before upserting
        const uniqueVariants = Array.from(
          new Map(
            normalizedVariants.map(v => [v.normalizedAttributes, { ...v, product_id: productId }])
          ).values()
        );

        // Get existing variants to preserve woocommerce fields
        const { data: existingVariants } = await supabase
          .from("product_variants")
          .select("id, woocommerce_id, woocommerce_connection_id, attributes")
          .eq("product_id", productId);

        // Normalize existing variants for comparison
        const normalizedExistingVariants = (existingVariants || []).map((v: any) => ({
          ...v,
          normalizedAttributes: normalizeAttributes(v.attributes)
        }));

        // Create a map of existing variants by normalized attributes for quick lookup
        const existingVariantsMap = new Map(
          normalizedExistingVariants.map((v: any) => [v.normalizedAttributes, v])
        );

        // Separate new variants from existing ones
        const variantsToInsert: any[] = [];
        const variantsToUpdate: any[] = [];

        uniqueVariants.forEach(variant => {
          const existingVariant = existingVariantsMap.get(variant.normalizedAttributes) as any;
          const variantData = {
            product_id: variant.product_id,
            attributes: variant.attributes,
            sku: variant.sku,
            rate: variant.rate,
            cost: variant.cost,
            stock_quantity: variant.stock_quantity,
            low_stock_threshold: variant.low_stock_threshold,
            image_url: variant.image_url,
            // Preserve woocommerce fields if they exist
            woocommerce_id: existingVariant?.woocommerce_id || null,
            woocommerce_connection_id: existingVariant?.woocommerce_connection_id || null,
          };

          if (existingVariant?.id) {
            // Existing variant - include id for update
            variantsToUpdate.push({
              ...variantData,
              id: existingVariant.id
            });
          } else {
            // New variant - no id, will be generated by database
            variantsToInsert.push(variantData);
          }
        });

        // Delete variants that are no longer needed (not in the new list)
        const newAttributeKeys = new Set(uniqueVariants.map(v => v.normalizedAttributes));
        const variantsToDelete = normalizedExistingVariants.filter((v: any) =>
          !newAttributeKeys.has(v.normalizedAttributes)
        );

        if (variantsToDelete.length > 0) {
          console.log(`Deleting ${variantsToDelete.length} obsolete variants`);
          const { error: deleteErr } = await supabase
            .from("product_variants")
            .delete()
            .in("id", variantsToDelete.map(v => v.id));
          if (deleteErr) {
            console.error("Error deleting obsolete variants:", deleteErr);
            throw deleteErr;
          }
        }

        // Insert new variants and update existing ones separately
        const allUpsertedData: any[] = [];

        if (variantsToInsert.length > 0) {
          console.log(`Inserting ${variantsToInsert.length} new variants for product ${productId}`);
          const { data: insertedData, error: insertErr } = await supabase
            .from("product_variants")
            .insert(variantsToInsert)
            .select();
          if (insertErr) {
            console.error("Error inserting new variants:", insertErr);
            throw insertErr;
          }
          allUpsertedData.push(...(insertedData || []));
          console.log(`Successfully inserted ${insertedData?.length || 0} new variants`);
        }

        if (variantsToUpdate.length > 0) {
          console.log(`Updating ${variantsToUpdate.length} existing variants for product ${productId}`);
          const { data: updatedData, error: updateErr } = await supabase
            .from("product_variants")
            .upsert(variantsToUpdate, {
              onConflict: 'id',
              ignoreDuplicates: false
            })
            .select();
          if (updateErr) {
            console.error("Error updating existing variants:", updateErr);
            throw updateErr;
          }
          allUpsertedData.push(...(updatedData || []));
          console.log(`Successfully updated ${updatedData?.length || 0} existing variants`);
        }

        console.log(`Total variants processed: ${allUpsertedData.length}`);
      } else if (!hasVariants) {
        // If no variants and hasVariants is false, delete all variants
        const { error: delErr } = await supabase
          .from("product_variants")
          .delete()
          .eq("product_id", productId);
        if (delErr) console.warn("Error deleting variants:", delErr);
      }

      console.log("Bulk upsert completed successfully");
      return true;
    },
    onSuccess: (_, variables) => {
      // Invalidate and refetch all product_variants queries (including specific product queries)
      queryClient.invalidateQueries({
        queryKey: ["product_variants"],
        refetchType: 'active' // Force refetch of active queries
      });
      queryClient.invalidateQueries({
        queryKey: ["products"],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({
        queryKey: ["all_product_variants"],
        refetchType: 'active'
      });
      // Also invalidate the specific product's variants query
      if (variables.productId) {
        queryClient.invalidateQueries({
          queryKey: ["product_variants", variables.productId],
          refetchType: 'active'
        });
      }
      toast.success("Variants saved successfully");
    },
    onError: (err: any) => {
      console.error("Bulk upsert error:", err);
      toast.error("Failed to save variants: " + err.message);
    },
  });

  const clearVariants = useMutation({
    mutationFn: async (productId: string) => {
      // Delete variants
      const { error: delErr } = await supabase
        .from("product_variants")
        .delete()
        .eq("product_id", productId);
      if (delErr) throw delErr;

      // Delete attribute values and attributes
      const { data: existingAttrs } = await supabase
        .from("product_attributes")
        .select("id")
        .eq("product_id", productId);

      if (existingAttrs && existingAttrs.length > 0) {
        const { error: delValsErr } = await supabase
          .from("product_attribute_values")
          .delete()
          .in("attribute_id", existingAttrs.map((r: any) => r.id));
        if (delValsErr) console.warn(delValsErr);
      }

      const { error: delAttrsErr } = await supabase
        .from("product_attributes")
        .delete()
        .eq("product_id", productId);
      if (delAttrsErr) console.warn(delAttrsErr);

      // Update product to not have variants
      const { error: updProdErr } = await supabase
        .from("products")
        .update({ has_variants: false })
        .eq("id", productId);
      if (updProdErr) throw updProdErr;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product_variants"],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({
        queryKey: ["products"],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({
        queryKey: ["all_product_variants"],
        refetchType: 'active'
      });
      toast.success("Variants cleared");
    },
    onError: (err: any) => {
      toast.error("Failed to clear variants: " + err.message);
    },
  });

  return { variants, isLoading, refetch, bulkUpsert, clearVariants };
};
