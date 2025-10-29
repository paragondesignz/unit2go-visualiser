-- Create submissions table
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON public.submissions(created_at DESC);

-- Create index on email for faster searching
CREATE INDEX IF NOT EXISTS submissions_email_idx ON public.submissions(email);

-- Enable Row Level Security (RLS)
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow admin access (you'll need to set up admin role)
-- For now, we'll create a policy that allows service role access
CREATE POLICY "Allow service role access" ON public.submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create policy to allow public inserts (for form submissions)
CREATE POLICY "Allow public inserts" ON public.submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Create policy to prevent public reads (only admins can read)
CREATE POLICY "Prevent public reads" ON public.submissions
  FOR SELECT
  TO anon, authenticated
  USING (false);
