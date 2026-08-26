// Regenera as variantes responsivas (WebP + JPEG) e o recorte de og-image
// a partir das imagens-fonte em public/images. Rodar após trocar hero-florenca.jpg
// ou escritorio.jpg: `npm run optimize:images`.
const sharp = require("sharp");
const path = require("path");

const IMG_DIR = path.join(__dirname, "..", "public", "images");
const HERO_WIDTHS = [640, 960, 1280, 1920];

async function main() {
  const heroSrc = path.join(IMG_DIR, "hero-florenca.jpg");
  const officeSrc = path.join(IMG_DIR, "escritorio.jpg");

  for (const width of HERO_WIDTHS) {
    const base = sharp(heroSrc).resize({ width });
    await base.clone().webp({ quality: 72 }).toFile(path.join(IMG_DIR, `hero-florenca-${width}.webp`));
    await base.clone().jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(IMG_DIR, `hero-florenca-${width}.jpg`));
  }

  await sharp(officeSrc).webp({ quality: 75 }).toFile(path.join(IMG_DIR, "escritorio.webp"));

  await sharp(heroSrc)
    .resize(1200, 630, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(IMG_DIR, "og-image.jpg"));

  console.log("Imagens otimizadas geradas em public/images.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
