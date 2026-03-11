export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Z Best Media",
    url: "https://zbestmedia.com",
    email: "hello@zbestmedia.com",
    telephone: "+1-213-632-8384"
  };
}

export function softwareAppSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Z Best Media Control Plane",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    brand: {
      "@type": "Brand",
      name: "Z Best Media"
    }
  };
}
