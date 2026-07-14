/*
  # Create Master User

  1. New User
    - Insert master user with email kadumeoli@gmail.com
    - Set password as 0212
    - Set role as 'gerente' (manager)

  This migration creates the master user account for initial system access.
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
) ON CONFLICT (email) DO UPDATE SET
  senha = '0212',
  funcao = 'gerente',
  nome = 'Administrador Master';