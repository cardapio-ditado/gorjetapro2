/*
  # Add test user for login

  1. New Data
    - Insert test user with email 'kadumeoli@gmail.com' and password '021254'
    - User will have 'gerente' function for full system access

  2. Security
    - This is a test user for development purposes
    - Password is stored in plain text as per current system design
*/

-- Insert test user if it doesn't already exist
INSERT INTO usuarios (nome, email, senha, funcao)
SELECT 'Carlos Eduardo', 'kadumeoli@gmail.com', '021254', 'gerente'
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE email = 'kadumeoli@gmail.com'
);