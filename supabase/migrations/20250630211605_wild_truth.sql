/*
  # Create Master User Carlos Oliveira

  1. Clean existing users
    - Delete all existing users from usuarios table
    - Clean up any auth users if needed

  2. Create new master user
    - Name: Carlos Oliveira
    - Email: kadumeoli@gmail.com
    - Password: 021254
    - Role: gerente (master)

  This migration creates the master user account for system access.
*/

-- Delete all existing users from usuarios table
DELETE FROM usuarios;

-- Insert the new master user Carlos Oliveira
INSERT INTO usuarios (
  id,
  nome,
  email,
  senha,
  funcao,
  criado_em
) VALUES (
  gen_random_uuid(),
  'Carlos Oliveira',
  'kadumeoli@gmail.com',
  '021254',
  'gerente',
  now()
);

-- Update any existing auth.users record if it exists
-- This is a safety measure in case there are orphaned auth records
UPDATE auth.users 
SET 
  email = 'kadumeoli@gmail.com',
  raw_user_meta_data = jsonb_build_object(
    'nome', 'Carlos Oliveira',
    'funcao', 'gerente'
  )
WHERE email = 'kadumeoli@gmail.com';