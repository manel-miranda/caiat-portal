
DO $$
DECLARE
  admin_id uuid := '9e73e824-cdcd-45e9-900a-3f9028f1d513';
  youssef uuid := '78d4551a-afd2-4cc9-85e4-600348c7a5c7';
  fatima uuid := 'e57082f0-3283-4a6a-a619-bce148207868';
  r1 uuid; r2 uuid; r3 uuid; r5 uuid; r6 uuid;
  g1 uuid; g2 uuid; g3 uuid; g4 uuid; g5 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
  st_dinner uuid; st_breakfast uuid; st_transfer uuid; st_laundry uuid; st_activity uuid;
BEGIN
  SELECT id INTO r1 FROM public.rooms WHERE number='1';
  SELECT id INTO r2 FROM public.rooms WHERE number='2';
  SELECT id INTO r3 FROM public.rooms WHERE number='3';
  SELECT id INTO r5 FROM public.rooms WHERE number='5';
  SELECT id INTO r6 FROM public.rooms WHERE number='6';
  SELECT id INTO st_dinner FROM public.service_types WHERE key='dinner';
  SELECT id INTO st_breakfast FROM public.service_types WHERE key='breakfast';
  SELECT id INTO st_transfer FROM public.service_types WHERE key='transfer';
  SELECT id INTO st_laundry FROM public.service_types WHERE key='laundry';
  SELECT id INTO st_activity FROM public.service_types WHERE key='activity';

  INSERT INTO public.guests (full_name, phone, nationality) VALUES ('Claire Dubois','+33612345678','France') RETURNING id INTO g1;
  INSERT INTO public.guests (full_name, phone, nationality) VALUES ('Marco Rossi','+39331122334','Italy') RETURNING id INTO g2;
  INSERT INTO public.guests (full_name, phone, nationality) VALUES ('Sarah Klein','+4915112345','Germany') RETURNING id INTO g3;
  INSERT INTO public.guests (full_name, phone, nationality) VALUES ('James Carter','+447700900123','United Kingdom') RETURNING id INTO g4;
  INSERT INTO public.guests (full_name, phone, nationality) VALUES ('Amina Benali','+212661223344','Morocco') RETURNING id INTO g5;

  INSERT INTO public.stays (guest_id, room_id, check_in, check_out, num_guests, source, accommodation_total, status, created_by, notes)
    VALUES (g1, r3, CURRENT_DATE - 2, CURRENT_DATE + 2, 2, 'booking_com', 3000, 'active', youssef, 'Late arrival, quiet room requested') RETURNING id INTO s1;
  INSERT INTO public.stays (guest_id, room_id, check_in, check_out, num_guests, source, accommodation_total, status, created_by)
    VALUES (g2, r6, CURRENT_DATE - 3, CURRENT_DATE, 4, 'whatsapp', 3300, 'active', fatima) RETURNING id INTO s2;
  INSERT INTO public.stays (guest_id, room_id, check_in, check_out, num_guests, source, accommodation_total, status, created_by)
    VALUES (g3, r1, CURRENT_DATE, CURRENT_DATE + 3, 2, 'phone', 1950, 'active', youssef) RETURNING id INTO s3;
  INSERT INTO public.stays (guest_id, room_id, check_in, check_out, num_guests, source, accommodation_total, status, created_by)
    VALUES (g4, r5, CURRENT_DATE + 1, CURRENT_DATE + 4, 2, 'email', 2100, 'active', fatima) RETURNING id INTO s4;
  INSERT INTO public.stays (guest_id, room_id, check_in, check_out, num_guests, source, accommodation_total, status, created_by, checked_out_at)
    VALUES (g5, r2, CURRENT_DATE - 6, CURRENT_DATE - 3, 1, 'walk_in', 1950, 'completed', youssef, now() - interval '3 days') RETURNING id INTO s5;

  INSERT INTO public.charges (stay_id, service_type_id, label, quantity, unit_price, created_by, notes) VALUES
    (s1, st_dinner, 'Dinner', 2, 180, youssef, 'Vegetarian'),
    (s1, st_laundry, 'Laundry', 1, 120, fatima, NULL),
    (s2, st_transfer, 'Transfer', 1, 350, fatima, 'Airport pickup'),
    (s2, st_breakfast, 'Breakfast', 4, 80, youssef, NULL),
    (s3, st_activity, 'Activity', 2, 500, youssef, 'Desert tour'),
    (s5, st_dinner, 'Dinner', 1, 180, youssef, NULL);

  INSERT INTO public.payments (stay_id, amount, method, received_by, created_at, notes) VALUES
    (s1, 1500, 'cash', youssef, now() - interval '2 hours', 'Deposit'),
    (s2, 2000, 'cash', fatima, now() - interval '5 hours', NULL),
    (s2, 1000, 'card', youssef, now() - interval '1 hour', NULL),
    (s5, 2130, 'cash', youssef, now() - interval '3 days', 'Final settlement');

  INSERT INTO public.requests (stay_id, room_id, service_type_id, label, scheduled_at, notes, status, created_by) VALUES
    (s1, r3, st_dinner, 'Dinner', (CURRENT_DATE + interval '20 hours'), 'Table for 2 at 20:00', 'pending', youssef),
    (s2, r6, st_transfer, 'Transfer', (CURRENT_DATE + interval '11 hours'), 'Taxi to airport', 'pending', fatima),
    (s3, r1, st_breakfast, 'Breakfast', (CURRENT_DATE + interval '32 hours'), 'Breakfast for 2 tomorrow 08:00', 'pending', youssef),
    (s1, r3, st_laundry, 'Laundry', (CURRENT_DATE - interval '4 hours'), NULL, 'completed', fatima);

  INSERT INTO public.cash_reconciliations (business_date, expected_total, counted_total, notes, closed_by, closed_at)
    VALUES (CURRENT_DATE - 1, 2130, 2130, 'All matched', admin_id, now() - interval '1 day');

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details) VALUES
    (youssef, 'stay.created', 'stay', s1, jsonb_build_object('room','3')),
    (fatima, 'payment.recorded', 'payment', s2, jsonb_build_object('amount',2000,'method','cash')),
    (admin_id, 'cash.reconciled', 'cash_reconciliation', NULL, jsonb_build_object('difference',0));
END $$;
