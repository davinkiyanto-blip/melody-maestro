import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";

// Update this page (the content is just a fallback if you fail to update the page)

const Index = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <section className="mx-auto w-full max-w-xl px-4 text-center">
        <h1 className="mb-3 text-4xl font-bold">Music API Playground</h1>
        <p className="mb-6 text-base text-muted-foreground">
          Gunakan UI test untuk memanggil endpoint Vercel: generate / wait / status.
        </p>
        <Button asChild>
          <NavLink to="/music-test">Buka Music Test</NavLink>
        </Button>
      </section>
    </main>
  );
};

export default Index;

