import { cn } from "@/lib/utils";

export const GradientBackground = ({ className }: { className?: string }) => {
  return (
    <div className={cn("min-h-screen w-full relative", className)}>
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(125% 125% at 50% 10%, #fff 40%, #6366f1 100%)",
        }}
      />
    </div>
  );
};

export const YellowGlowBackground = ({ className }: { className?: string }) => {
  return (
    <div className={cn("min-h-screen w-full bg-white relative", className)}>
      {/* Golden Glow Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(125% 125% at 50% 10%, #ffffff 40%, #fbbf24 100%)
          `,
          backgroundSize: "100% 100%",
        }}
      />
    </div>
  );
};
