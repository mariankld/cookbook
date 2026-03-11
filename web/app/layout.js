import "./globals.css";

export const metadata = {
  title: "Family Recipes",
  description: "Minimal recipe website powered by Supabase"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">{children}</div>
      </body>
    </html>
  );
}
