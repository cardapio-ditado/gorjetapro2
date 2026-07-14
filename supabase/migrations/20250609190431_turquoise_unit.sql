/*
  # Create master user

  1. Insert master user into usuarios table
    - Email: kadumeoli@gmail.com
    - Password: 0212 (plain text for now)
    - Role: gerente
*/

-- Insert master user
INSERT INTO usuarios (
  nome,
  email,
  senha,
  funcao
) VALUES (
  'Administrador Master',
  'kadumeoli@gmail.com',
  '0212',
  'gerente'
) ON CONFLICT (email) DO NOTHING;