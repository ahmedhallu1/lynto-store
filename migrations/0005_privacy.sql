-- Personal-data deletion support: mark orders whose customer data has been erased/anonymised.
ALTER TABLE orders ADD COLUMN anonymized_at INTEGER;
