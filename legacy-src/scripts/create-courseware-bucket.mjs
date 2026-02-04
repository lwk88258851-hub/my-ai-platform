import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bucket = 'courseware';

const main = async () => {
  const existing = await supabase.storage.getBucket(bucket);
  if (!existing.error) {
    console.log(`Bucket already exists: ${bucket}`);
    return;
  }

  const created = await supabase.storage.createBucket(bucket, {
    public: false,
    allowedMimeTypes: ['application/pdf', 'video/mp4'],
    fileSizeLimit: 1024 * 1024 * 1024,
  });

  if (created.error) {
    console.error(created.error);
    process.exit(1);
  }

  console.log(`Bucket created: ${bucket}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

