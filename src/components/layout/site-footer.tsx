const CURRENT_YEAR = new Date().getFullYear();

const SiteFooter = () => (
  <footer className="border-t">
    <div className="text-muted-foreground mx-auto max-w-6xl px-4 py-6 text-sm">
      © {CURRENT_YEAR} SaaS Boilerplate. All rights reserved.
    </div>
  </footer>
);

export { SiteFooter };
export default SiteFooter;
