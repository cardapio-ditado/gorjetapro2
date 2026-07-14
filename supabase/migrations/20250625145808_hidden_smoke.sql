/*
  # User Synchronization Migration

  1. Functions
    - Create function to handle new user creation
    - Create trigger for automatic user sync

  2. User Management
    - Sync existing auth users with usuarios table
    - Handle master user setup safely

  3. Security
    - Maintain RLS policies
    - Ensure proper foreign key relationships
*/

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert new user into usuarios table
  INSERT INTO usuarios (
    id,
    nome,
    email,
    senha,
    funcao,
    criado_em
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    'managed_by_supabase_auth',
    'gerente',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = NEW.email,
    nome = COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      usuarios.nome,
      split_part(NEW.email, '@', 1)
    );
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Handle email conflicts gracefully
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT OR UPDATE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  END IF;
END $$;

-- Sync existing auth users to usuarios table
INSERT INTO usuarios (
  id,
  nome,
  email,
  senha,
  funcao,
  criado_em
)
SELECT 
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    split_part(au.email, '@', 1)
  ),
  au.email,
  'managed_by_supabase_auth',
  CASE 
    WHEN au.email = 'kadumeoli@gmail.com' THEN 'gerente'
    ELSE 'gerente'
  END,
  au.created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios u WHERE u.id = au.id
)
ON CONFLICT (email) DO NOTHING;

-- Ensure master user has correct role
UPDATE usuarios 
SET 
  funcao = 'gerente',
  nome = 'Administrador Master'
WHERE email = 'kadumeoli@gmail.com';