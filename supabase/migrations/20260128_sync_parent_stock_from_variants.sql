-- Keep parent product stock_quantity in sync with variants

create or replace function public.sync_parent_stock_from_variants(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.products p
  set stock_quantity = coalesce(v.total_stock, 0)
  from (
    select product_id, sum(coalesce(stock_quantity, 0))::int as total_stock
    from public.product_variants
    where product_id = p_product_id
    group by product_id
  ) v
  where p.id = p_product_id
    and p.has_variants = true;
end;
$$;

create or replace function public.trg_sync_parent_stock_from_variants()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_product_id uuid := coalesce(new.product_id, old.product_id);
begin
  if target_product_id is not null then
    perform public.sync_parent_stock_from_variants(target_product_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_product_variants_sync_parent_stock_ins on public.product_variants;
create trigger trg_product_variants_sync_parent_stock_ins
after insert on public.product_variants
for each row execute function public.trg_sync_parent_stock_from_variants();

drop trigger if exists trg_product_variants_sync_parent_stock_upd on public.product_variants;
create trigger trg_product_variants_sync_parent_stock_upd
after update on public.product_variants
for each row execute function public.trg_sync_parent_stock_from_variants();

drop trigger if exists trg_product_variants_sync_parent_stock_del on public.product_variants;
create trigger trg_product_variants_sync_parent_stock_del
after delete on public.product_variants
for each row execute function public.trg_sync_parent_stock_from_variants();

