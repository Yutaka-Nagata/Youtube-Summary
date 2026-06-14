/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/transcript": ["./bin/yt-dlp"],
  },
};

export default nextConfig;
