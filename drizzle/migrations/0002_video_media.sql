-- Migration 0002: Video Media Support
-- Adds: videos column on listing table

ALTER TABLE listing
  ADD COLUMN videos jsonb DEFAULT '[]'::jsonb;

UPDATE listing SET videos = '[]'::jsonb WHERE videos IS NULL;
