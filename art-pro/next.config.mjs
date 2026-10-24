/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Served inside the Mockup Pro shop (mockup-pro …/shop/mockup rewrites here).
  basePath: '/shop/mockup',
  async redirects() {
    return [{ source: '/', destination: '/shop/mockup', basePath: false, permanent: false }]
  },
}
export default nextConfig
