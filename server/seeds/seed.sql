-- Demo data. All four users share the password: password123
-- Hash below is bcrypt('password123', 10).

INSERT INTO users (name, email, password_hash) VALUES
  ('Asha Kumar',  'asha@example.com',  '$2b$10$Ul8elGbK.o4o9z0T4Z57d.QoKIJWSxAQM.ErT4IZW.qrezYbu3dcy'),
  ('Ben Carter',  'ben@example.com',   '$2b$10$Ul8elGbK.o4o9z0T4Z57d.QoKIJWSxAQM.ErT4IZW.qrezYbu3dcy'),
  ('Chen Li',     'chen@example.com',  '$2b$10$Ul8elGbK.o4o9z0T4Z57d.QoKIJWSxAQM.ErT4IZW.qrezYbu3dcy'),
  ('Divya Rao',   'divya@example.com', '$2b$10$Ul8elGbK.o4o9z0T4Z57d.QoKIJWSxAQM.ErT4IZW.qrezYbu3dcy');

INSERT INTO items (owner_id, name, description, category, image_url, availability_status) VALUES
  ((SELECT id FROM users WHERE email = 'asha@example.com'),  'Power Drill',
   'Cordless 18V drill with two batteries and a bit set.', 'Tools', NULL, 'available'),
  ((SELECT id FROM users WHERE email = 'ben@example.com'),   'Bicycle',
   'Hybrid city bike, medium frame, includes helmet and lock.', 'Sports', NULL, 'available'),
  ((SELECT id FROM users WHERE email = 'chen@example.com'),  'Calculator',
   'Scientific graphing calculator, great for exams.', 'Study', NULL, 'available'),
  ((SELECT id FROM users WHERE email = 'divya@example.com'), 'Camping Kit',
   '2-person tent, two sleeping bags and a camp stove.', 'Outdoor', NULL, 'available');
