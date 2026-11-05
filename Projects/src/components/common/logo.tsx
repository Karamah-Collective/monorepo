import { Link } from "@tanstack/react-router";
import useProjectStore from "@/store/project";
import karamahLogoUrl from "../../../../shared/brand/karamah-logo.svg";

type LogoProps = {
  className?: string;
};

export function Logo({ className = "" }: LogoProps) {
  const { setProject } = useProjectStore();

  return (
    <Link
      onClick={() => {
        setProject(undefined);
      }}
      to="/dashboard"
      className={`w-auto ${className}`}
    >
      <img
        src={karamahLogoUrl}
        alt="Karamah"
        className="size-8 object-contain dark:invert"
      />
    </Link>
  );
}
