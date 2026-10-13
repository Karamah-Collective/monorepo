import { useTranslation } from "react-i18next";

export function ProjectsBranding() {
  const { t } = useTranslation();

  return (
    <span className="text-muted-foreground">
      {t("publicProject:branding.poweredBy")} {" "}
      <span className="font-medium text-foreground">{t("common:appName")}</span>
    </span>
  );
}
