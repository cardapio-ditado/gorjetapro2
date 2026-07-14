/*
  # Create Master User

  1. New User
    - Creates master user with email kadumeoli@gmail.com
    - Sets password as 0212
    - Assigns 'gerente' role for full system access

  2. Security
    - Uses bcrypt for password hashing
    - Sets up proper user record in usuarios table
*/

-- Insert master user into usuarios table
INSERT INTO usuarios (
  id,
  nome,
  email,
  senha,
  funcao,
  criado_em
) VALUES (
  gen_random_uuid(),
  'Administrador Master',
  'kadumeoli@gmail.com',
  crypt('0212', gen_salt('bf')),
  'gerente',
  now()
) ON CONFLICT (email) DO UPDATE SET
  senha = crypt('0212', gen_salt('bf')),
  funcao = 'gerente',
  nome = 'Administrador Master';

-- Also create the user in Supabase Auth (this would typically be done through the Supabase dashboard or API)
-- For now, we'll just ensure the usuarios table has the record