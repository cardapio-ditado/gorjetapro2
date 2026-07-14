/*
  # Remove unique constraint from agenda_pagamentos.data_base

  The table had a UNIQUE constraint on data_base which allowed only ONE payment
  per day. This is wrong — the table should hold multiple payments per day.

  This migration drops that constraint so multiple rows with the same data_base
  can exist (which is the intended behavior of the daily agenda).
*/

ALTER TABLE agenda_pagamentos DROP CONSTRAINT IF EXISTS agenda_pagamentos_data_base_key;
