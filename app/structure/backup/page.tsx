import { redirect } from "next/navigation";

/** Yedekleme Ayarlar'a taşındı — eski bağlantı/yer imi kırılmasın */
export default function BackupRedirect() {
  redirect("/settings");
}
