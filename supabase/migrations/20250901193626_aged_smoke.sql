/*
  # Clear Inventory System Database

  1. Tables to Clear
    - `movimentacoes_estoque` - All stock movements
    - `estoque_saldos` - All stock balances  
    - `saldos_estoque` - All stock balances (alternative table)
    - `itens_entrada_compra` - All purchase items
    - `entradas_compras` - All purchase entries
    - `ficha_ingredientes` - All recipe ingredients
    - `producoes` - All productions
    - `fichas_tecnicas` - All technical sheets
    - `itens_estoque` - All stock items
    - `estoques` - All warehouses/stocks

  2. Order of Operations
    - Delete in correct order to respect foreign key constraints
    - Start with dependent tables first
    - End with main tables

  3. Safety
    - Uses DELETE instead of DROP to preserve table structure
    - Maintains all constraints and relationships
    - Preserves RLS policies and triggers
*/

-- Clear all stock movements first (has foreign keys to items and stocks)
DELETE FROM movimentacoes_estoque;

-- Clear stock balances (depends on items and stocks)
DELETE FROM estoque_saldos;
DELETE FROM saldos_estoque;

-- Clear purchase items (depends on purchases and items)
DELETE FROM itens_entrada_compra;

-- Clear purchase entries (depends on stocks and suppliers)
DELETE FROM entradas_compras;

-- Clear recipe ingredients (depends on recipes and items)
DELETE FROM ficha_ingredientes;

-- Clear productions (depends on technical sheets)
DELETE FROM producoes;

-- Clear technical sheets
DELETE FROM fichas_tecnicas;

-- Clear stock items
DELETE FROM itens_estoque;

-- Clear warehouses/stocks (main table)
DELETE FROM estoques;