const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  PageBreak,
  TableOfContents,
  LevelFormat,
  ImageRun,
} = require("docx");
const fs = require("fs");

// Page settings: A4
// A4: 11906 x 16838 DXA
// Margins: Top 0.7" = 1008, Bottom 0.7" = 1008, Left 1.25" = 1800, Right 0.75" = 1080
// Content width = 11906 - 1800 - 1080 = 9026 DXA

const PAGE_WIDTH = 11906;
const TOP_MARGIN = 1008;
const BOTTOM_MARGIN = 1008;
const LEFT_MARGIN = 1800;
const RIGHT_MARGIN = 1080;
const CONTENT_WIDTH = 9026;

const border = { style: BorderStyle.SINGLE, size: 4, color: "3B82F6" };
const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const thinBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
};

// Helper: Body paragraph
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 160 }, // 1.5 spacing, some after
    children: [
      new TextRun({ text, font: "Times New Roman", size: 24, ...opts }),
    ],
  });
}

// Helper: Bold body
function bodyBold(text) {
  return body(text, { bold: true });
}

// Helper: Empty paragraph spacer
function spacer() {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

// Helper: page break
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// Helper: centered paragraph
function centered(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text, font: "Times New Roman", size: 24, ...opts }),
    ],
  });
}

// Helper: bullet item
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 100 },
    children: [new TextRun({ text, font: "Times New Roman", size: 24 })],
  });
}

// Helper: numbered item
function numbered(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 100 },
    children: [new TextRun({ text, font: "Times New Roman", size: 24 })],
  });
}

// Helper: table header cell
function thCell(text, width) {
  return new TableCell({
    borders: thinBorders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: "1E3A5F", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            font: "Times New Roman",
            size: 20,
            bold: true,
            color: "FFFFFF",
          }),
        ],
      }),
    ],
  });
}

// Helper: table data cell
function tdCell(text, width, shaded = false) {
  return new TableCell({
    borders: thinBorders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: shaded ? "EBF3FB" : "FFFFFF", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text, font: "Times New Roman", size: 20 })],
      }),
    ],
  });
}

// Load images
const erDiagramImg = fs.readFileSync(
  "/mnt/user-data/uploads/1779206942987_image.png",
);
const archDiagramImg = fs.readFileSync(
  "/mnt/user-data/uploads/1779206946639_image.png",
);

function imageParag(data, w, h, caption) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
      children: [
        new ImageRun({
          type: "png",
          data,
          transformation: { width: w, height: h },
          altText: { title: caption, description: caption, name: caption },
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: caption,
          font: "Times New Roman",
          size: 20,
          italics: true,
          bold: true,
        }),
      ],
    }),
  ];
}

// Build document
const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Times New Roman", size: 24 } },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Times New Roman", color: "1E3A5F" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Times New Roman", color: "2563EB" },
        paragraph: { spacing: { before: 300, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Times New Roman", color: "3B82F6" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    // ======== SECTION 1: Title Page (no page numbers) ========
    {
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: 16838 },
          margin: {
            top: TOP_MARGIN,
            bottom: BOTTOM_MARGIN,
            left: LEFT_MARGIN,
            right: RIGHT_MARGIN,
          },
        },
      },
      children: [
        spacer(),
        spacer(),
        spacer(),
        centered("INTERNSHIP REPORT", {
          size: 40,
          bold: true,
          color: "1E3A5F",
        }),
        spacer(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "E-Commerce Web Application Development",
              font: "Times New Roman",
              size: 30,
              bold: true,
              color: "2563EB",
            }),
          ],
        }),
        spacer(),
        spacer(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: "3B82F6",
              space: 4,
            },
          },
          children: [],
        }),
        spacer(),
        spacer(),
        centered("Submitted By:", { size: 24, bold: true }),
        spacer(),
        centered("Tushar Gour", { size: 28, bold: true }),
        centered("B.Tech – Computer Science & Engineering", { size: 24 }),
        spacer(),
        spacer(),
        centered("Internship Period:", { size: 24, bold: true }),
        centered("28th January 2026 – 30th April 2026", { size: 24 }),
        spacer(),
        spacer(),
        centered("Organization:", { size: 24, bold: true }),
        centered("Tushar Store – E-Commerce Platform", { size: 24 }),
        spacer(),
        spacer(),
        spacer(),
        centered("Academic Year: 2025–2026", { size: 22, italics: true }),
        spacer(),
        centered("Duration: 14 Weeks", { size: 22, italics: true }),
        pageBreak(),
      ],
    },
    // ======== SECTION 2: TOC + Report Body ========
    {
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: 16838 },
          margin: {
            top: TOP_MARGIN,
            bottom: BOTTOM_MARGIN + 400,
            left: LEFT_MARGIN,
            right: RIGHT_MARGIN,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: {
                bottom: {
                  style: BorderStyle.SINGLE,
                  size: 4,
                  color: "3B82F6",
                  space: 2,
                },
              },
              children: [
                new TextRun({
                  text: "Internship Report – E-Commerce Web Application",
                  font: "Times New Roman",
                  size: 20,
                  color: "1E3A5F",
                  bold: true,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: {
                top: {
                  style: BorderStyle.SINGLE,
                  size: 4,
                  color: "3B82F6",
                  space: 2,
                },
              },
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Page ",
                  font: "Times New Roman",
                  size: 20,
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: "Times New Roman",
                  size: 20,
                }),
                new TextRun({
                  text: " of ",
                  font: "Times New Roman",
                  size: 20,
                }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: "Times New Roman",
                  size: 20,
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        // TABLE OF CONTENTS
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: "Table of Contents",
              font: "Times New Roman",
              size: 32,
              bold: true,
            }),
          ],
        }),
        new TableOfContents("Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),
        pageBreak(),

        // ======== EXECUTIVE SUMMARY ========
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Executive Summary")],
        }),
        body(
          'This report documents the 14-week internship undertaken from 28th January 2026 to 30th April 2026, focused on the development of a full-stack e-commerce web application titled "Tushar Store." The internship provided hands-on exposure to the complete software development lifecycle, encompassing frontend design, backend engineering, database modeling, and API integration.',
        ),
        body(
          "The project involved building a production-grade MERN stack application (MongoDB, Express.js, React.js, Node.js) featuring a multi-role user system (Customer, Vendor, Admin), product catalog management, shopping cart, order tracking, wishlist, and Razorpay payment gateway integration. The frontend was crafted using React 19 with Zustand for state management and Tailwind CSS for responsive UI, while the backend followed a layered architecture using repositories, services, and controllers.",
        ),
        body(
          "Over the course of the internship, the developer progressed from foundational HTML/CSS concepts to implementing complex full-stack features including JWT authentication, RESTful APIs, Cloudinary image storage, and end-to-end payment flows. The internship also developed professional competencies in version control using Git/GitHub, project structuring, and debugging techniques. The final deliverable is a fully functional, deployable e-commerce platform demonstrating strong industry-level engineering practices.",
        ),
        pageBreak(),

        // ======== CHAPTER 1 ========
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Chapter 1: Introduction")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("1.1  Introduction to the Business Sector")],
        }),
        body(
          "The global e-commerce industry has experienced explosive growth over the past decade. According to industry estimates, global e-commerce sales surpassed USD 5.8 trillion in 2023, and this figure is expected to grow further as digital adoption accelerates across emerging markets. The sector encompasses Business-to-Consumer (B2C), Business-to-Business (B2B), and multi-vendor marketplace models, driven by mobile commerce, digital payments, and evolving consumer behavior.",
        ),
        body(
          "In India, the e-commerce market is one of the fastest-growing in the world, fueled by increasing internet penetration, affordable smartphones, and government initiatives such as Digital India. Platforms like Flipkart, Amazon India, Meesho, and Nykaa have established strong footholds, while the emergence of Direct-to-Consumer (D2C) brands presents new opportunities for technology-driven marketplaces.",
        ),
        body(
          "The intersection of FinTech and e-commerce is particularly significant in the Indian context, with payment gateways such as Razorpay, Paytm, and PhonePe enabling frictionless digital transactions. Software-as-a-Service (SaaS) models powering storefronts and the proliferation of cloud-native backend infrastructure have lowered barriers for new entrants into the e-commerce technology space.",
        ),
        body(
          "The technology behind modern e-commerce platforms — full-stack JavaScript (MERN/MEAN), microservices, cloud storage, and real-time systems — represents a critical domain for computer science engineers. This internship was situated squarely within this rapidly evolving sector, providing practical exposure to building scalable, production-ready commerce software.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("1.2  Overview of the Organization")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("1.2.1  History & Background")],
        }),
        body(
          "Tushar Store is a portfolio e-commerce project conceptualized and developed during the internship period as a demonstration of full-stack engineering competency. The platform simulates a real-world multi-vendor marketplace where customers can browse and purchase products, vendors can list and manage their inventory, and administrators can oversee platform operations.",
        ),
        body(
          "The project was initiated as part of a structured 14-week learning and development program, progressing from foundational web technologies to a fully deployed application. While not a commercial entity in the traditional sense, the platform models the architecture and feature set of production e-commerce systems, incorporating industry-standard tools and practices.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("1.2.2  Product Lines & Services")],
        }),
        body("The Tushar Store platform provides the following core services:"),
        bullet("Multi-vendor product marketplace with category-based browsing"),
        bullet(
          "User authentication and role-based access control (Customer, Vendor, Admin)",
        ),
        bullet("Shopping cart, wishlist, and order management for customers"),
        bullet(
          "Vendor dashboard with product CRUD operations, order tracking, and revenue analytics",
        ),
        bullet("Integrated Razorpay payment gateway for secure transactions"),
        bullet(
          "Cloudinary-powered image upload and management for product listings",
        ),
        bullet("RESTful API backend serving all frontend operations"),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("1.2.3  Competitors")],
        }),
        body(
          "In the commercial landscape, platforms comparable to Tushar Store include:",
        ),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [2500, 3263, 3263],
          rows: [
            new TableRow({
              children: [
                thCell("Platform", 2500),
                thCell("Type", 3263),
                thCell("Key Differentiator", 3263),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Amazon / Flipkart", 2500, false),
                tdCell("B2C Marketplace", 3263, false),
                tdCell("Scale, logistics, AI recommendations", 3263, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Meesho", 2500, true),
                tdCell("Social Commerce", 3263, true),
                tdCell("Reseller model, tier-2/3 focus", 3263, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Shopify", 2500, false),
                tdCell("SaaS Storefront", 3263, false),
                tdCell("Plug-and-play vendor storefronts", 3263, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("WooCommerce", 2500, true),
                tdCell("Open Source Plugin", 3263, true),
                tdCell("WordPress integration, customizable", 3263, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Nykaa", 2500, false),
                tdCell("Niche D2C Marketplace", 3263, false),
                tdCell("Beauty vertical, curated catalog", 3263, false),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Table 1.1: Competitive Landscape",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("1.2.4  Summary of Departments")],
        }),
        body(
          "The organizational structure of the internship project mapped to the following functional areas:",
        ),
        bullet(
          "Frontend Development – React.js UI, component architecture, state management",
        ),
        bullet(
          "Backend Engineering – Node.js/Express.js API design and implementation",
        ),
        bullet(
          "Database Administration – MongoDB schema design, indexing, and data modeling",
        ),
        bullet(
          "DevOps & Deployment – Environment configuration, Cloudinary integration, Vercel/Railway deployment",
        ),
        bullet("Quality Assurance – Manual testing, API testing via Postman"),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("1.2.5  Problem Identification and Solution")],
        }),
        body(
          "The core problem addressed by this project is the complexity involved in building a multi-vendor marketplace that satisfies diverse stakeholder needs simultaneously. Specifically:",
        ),
        body(
          "Problem: Small and mid-scale vendors lack affordable, customizable platforms that provide both storefront management tools and analytics. Existing solutions are either too expensive (Shopify), too complex to customize (WooCommerce), or too restrictive (Amazon seller).",
        ),
        body(
          "Solution: Tushar Store implements a unified platform where vendors can register, list products with images, track orders, and monitor revenue — all through a clean, role-aware dashboard. Customers benefit from a streamlined shopping experience with secure payments, order tracking, and wishlist functionality. The admin has full oversight across all orders and catalog management.",
        ),
        body(
          "The technical solution leverages the MERN stack for its unified JavaScript ecosystem, enabling rapid development and shared type conventions between frontend and backend. REST APIs decouple the client from the server, enabling future scalability to mobile clients. Razorpay integration addresses the payment challenge within the Indian market context.",
        ),
        pageBreak(),

        // ======== CHAPTER 2 ========
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Chapter 2: Internship Plan & Environment")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("2.1  Plan of Internship")],
        }),
        body(
          "The internship was structured as a 14-week progressive learning program organized into seven fortnightly milestones. Each fortnight introduced new technical competencies building upon the previous period, culminating in the delivery of a complete, production-grade e-commerce application.",
        ),
        spacer(),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [1400, 2200, 2663, 2763],
          rows: [
            new TableRow({
              children: [
                thCell("Period", 1400),
                thCell("Duration", 2200),
                thCell("Technical Focus", 2663),
                thCell("Deliverable", 2763),
              ],
            }),
            new TableRow({
              children: [
                tdCell("FNR 1", 1400, false),
                tdCell("28 Jan – 31 Jan 2026", 2200, false),
                tdCell("HTML5, CSS3, Responsive Layouts", 2663, false),
                tdCell("Responsive Webpages", 2763, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("FNR 2", 1400, true),
                tdCell("01 Feb – 15 Feb 2026", 2200, true),
                tdCell("Semantic HTML, JavaScript, jQuery, Forms", 2663, true),
                tdCell("Interactive Web Forms", 2763, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("FNR 3", 1400, false),
                tdCell("16 Feb – 28 Feb 2026", 2200, false),
                tdCell(
                  "JS Interactivity, DOM Manipulation, Debugging",
                  2663,
                  false,
                ),
                tdCell("Dynamic Webpages", 2763, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("FNR 4", 1400, true),
                tdCell("01 Mar – 15 Mar 2026", 2200, true),
                tdCell(
                  "Bootstrap, Navigation, APIs, Local Storage",
                  2663,
                  true,
                ),
                tdCell("Responsive Navigation Systems", 2763, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("FNR 5", 1400, false),
                tdCell("16 Mar – 31 Mar 2026", 2200, false),
                tdCell(
                  "Full Frontend Integration, UI/UX, Deployment",
                  2663,
                  false,
                ),
                tdCell("Complete Frontend Application", 2763, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("FNR 6", 1400, true),
                tdCell("01 Apr – 15 Apr 2026", 2200, true),
                tdCell("Advanced JS, Components, Security Basics", 2663, true),
                tdCell("Reusable Component Library", 2763, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("FNR 7", 1400, false),
                tdCell("16 Apr – 30 Apr 2026", 2200, false),
                tdCell(
                  "External APIs, JSON, Multi-Page Architecture",
                  2663,
                  false,
                ),
                tdCell("Full-Stack E-Commerce Platform", 2763, false),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Table 2.1: Internship Schedule and Milestones",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        spacer(),
        body(
          "The internship commenced with a structured orientation covering the development environment setup, project goals, and coding conventions. The initial weeks focused on strengthening foundational web development skills before transitioning to framework-level development with React.js and Node.js/Express.js in the latter half of the program.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("2.2  Technical Environment")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("2.2.1  Hardware / Software Stack")],
        }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [2500, 6526],
          rows: [
            new TableRow({
              children: [
                thCell("Category", 2500),
                thCell("Tools / Configuration", 6526),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Operating System", 2500, false),
                tdCell(
                  "Windows 11 (Development), Ubuntu (Server-side testing)",
                  6526,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Code Editor / IDE", 2500, true),
                tdCell(
                  "Visual Studio Code (VS Code) v1.90+ with ESLint, Prettier, Tailwind IntelliSense extensions",
                  6526,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Version Control", 2500, false),
                tdCell(
                  "Git 2.45 + GitHub (branching, pull requests, issue tracking)",
                  6526,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Package Managers", 2500, true),
                tdCell(
                  "npm (Node.js v20 LTS), with nodemon for dev auto-restart",
                  6526,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("API Testing", 2500, false),
                tdCell(
                  "Postman – collection-based REST API testing and documentation",
                  6526,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Database Client", 2500, true),
                tdCell(
                  "MongoDB Atlas (Cloud), MongoDB Compass (local inspection)",
                  6526,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Browser", 2500, false),
                tdCell(
                  "Google Chrome with DevTools for debugging, network inspection, and React DevTools",
                  6526,
                  false,
                ),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Table 2.2: Hardware and Software Stack",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("2.2.2  Technologies Used")],
        }),
        body(
          "The project employed the following technologies across the development stack:",
        ),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [1800, 2000, 5226],
          rows: [
            new TableRow({
              children: [
                thCell("Layer", 1800),
                thCell("Technology", 2000),
                thCell("Role in Project", 5226),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Frontend", 1800, false),
                tdCell("React 19, Vite 8", 2000, false),
                tdCell(
                  "UI rendering, SPA routing, component-based architecture",
                  5226,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Styling", 1800, true),
                tdCell("Tailwind CSS v4", 2000, true),
                tdCell("Utility-first responsive design system", 5226, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("State Mgmt", 1800, false),
                tdCell("Zustand v5", 2000, false),
                tdCell(
                  "Global state for auth, cart; localStorage persistence",
                  5226,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Routing", 1800, true),
                tdCell("React Router DOM v7", 2000, true),
                tdCell(
                  "Client-side navigation and route protection",
                  5226,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("HTTP Client", 1800, false),
                tdCell("Axios v1.13", 2000, false),
                tdCell(
                  "API requests with interceptors for auth tokens",
                  5226,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Backend", 1800, true),
                tdCell("Node.js v20, Express v4", 2000, true),
                tdCell("RESTful API server, middleware pipeline", 5226, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Database", 1800, false),
                tdCell("MongoDB + Mongoose", 2000, false),
                tdCell(
                  "Document-oriented data storage, schema validation",
                  5226,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Auth", 1800, true),
                tdCell("JWT + bcryptjs", 2000, true),
                tdCell(
                  "Stateless authentication, password hashing",
                  5226,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Payments", 1800, false),
                tdCell("Razorpay SDK", 2000, false),
                tdCell(
                  "Order creation, payment verification, HMAC-SHA256",
                  5226,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Images", 1800, true),
                tdCell("Cloudinary SDK v2", 2000, true),
                tdCell(
                  "Base64/URL image upload, CDN-hosted storage",
                  5226,
                  true,
                ),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Table 2.3: Technologies Used Across the Stack",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        pageBreak(),

        // ======== CHAPTER 3 ========
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Chapter 3: Technical Work & Training")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("3.1  Project Overview & Architecture")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3.1.1  Project Module")],
        }),
        body(
          "The internship project — Tushar Store — is a complete multi-vendor e-commerce web application developed as a solo engineering exercise. The application is divided into two primary modules:",
        ),
        bullet(
          "Frontend Module: A React.js Single Page Application (SPA) housed in the /frontend directory, responsible for all user interface rendering, navigation, and client-side state. It communicates exclusively via HTTP/REST with the backend.",
        ),
        bullet(
          "Backend Module: A Node.js/Express.js REST API server in the /backend directory, providing all business logic, authentication, data persistence, payment processing, and image management.",
        ),
        body(
          "Within these modules, the intern was responsible for the following sub-modules:",
        ),
        bullet(
          "Authentication System: Register, Login, JWT token management, role-based access (Customer/Vendor/Admin)",
        ),
        bullet(
          "Product Catalog: CRUD operations, category filtering, search, featured/best-seller flags, image upload",
        ),
        bullet(
          "Shopping Cart: Zustand-based persistent cart with localStorage, quantity management",
        ),
        bullet(
          "Order Management: Order creation, status tracking (pending/processing/shipped/delivered/cancelled)",
        ),
        bullet(
          "Payment Flow: Razorpay order creation, client-side checkout widget, server-side HMAC verification",
        ),
        bullet(
          "Wishlist: Product save/remove functionality with backend persistence",
        ),
        bullet(
          "Vendor Dashboard: Revenue analytics, order visibility, product management panel",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3.1.2  System Architecture")],
        }),
        body(
          "The application follows a three-tier architecture comprising the Presentation Layer (React frontend), Application Layer (Express.js backend), and Data Layer (MongoDB). The backend itself is further organized into a layered architecture: Routes → Controllers → Services → Repositories → Models. This separation of concerns ensures testability, maintainability, and clear responsibility boundaries.",
        ),
        spacer(),
        ...imageParag(
          archDiagramImg,
          580,
          380,
          "Figure 3.1: System Architecture Diagram – E-Commerce Web Application",
        ),
        spacer(),
        body(
          "The frontend communicates with the backend exclusively through the /api prefix endpoints. An Axios client service layer handles request interceptors (automatic Bearer token injection) and response error normalization. All external services (Cloudinary, Razorpay) are accessed only from the backend, ensuring API secrets remain server-side.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3.1.3  Database Design")],
        }),
        body(
          "The MongoDB database consists of five primary collections: Users, Products, Orders, Carts, and a virtual Payments collection (managed through Razorpay with order-level paymentId storage). Mongoose ODM provides schema validation, virtuals, and middleware hooks for password hashing.",
        ),
        spacer(),
        ...imageParag(
          erDiagramImg,
          580,
          390,
          "Figure 3.2: ER Diagram – E-Commerce Web Application Database",
        ),
        spacer(),
        body(
          "Key design decisions in the database schema include: embedding order items as a sub-document array in the Orders collection for atomic reads; using $addToSet for wishlist to prevent duplicates; maintaining vendor reference within each order item to enable vendor-specific order filtering without joins; and applying compound indexes on (user, createdAt) for efficient order history queries.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("3.2  Development & Tasks Performed")],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3.2.1  Coding / Development")],
        }),
        body(
          "The development followed a backend-first approach, establishing API contracts before building the corresponding frontend views. The following describes the major technical implementations:",
        ),
        spacer(),
        bodyBold("Authentication System"),
        body(
          "The authentication system uses JSON Web Tokens (JWT) with bcryptjs password hashing. Upon registration, user data is validated, the password is hashed with a salt factor of 12, and a JWT signed with a configurable secret is returned. The authenticate middleware verifies tokens on protected routes and attaches the decoded user ID and role to the request object. Role guards (authorizeAdmin, authorizeVendor) enforce access control at the route level.",
        ),
        spacer(),
        bodyBold("Product Service & Image Pipeline"),
        body(
          "Products support multi-image storage via Cloudinary. The ProductService.resolveImages() method accepts an array of input strings that may be base64-encoded data URLs (from file uploads), HTTPS URLs (existing images), or already-hosted Cloudinary URLs. The service detects the input type and routes accordingly — uploading base64 images to Cloudinary and returning the secure CDN URL, while passing through existing URLs unchanged. This design avoids re-uploading already-hosted images and handles the vendor product creation flow.",
        ),
        spacer(),
        bodyBold("Payment Integration"),
        body(
          "The payment flow implements the Razorpay order-verify pattern: (1) the client requests an order creation from the backend, which creates a Razorpay order with the computed amount in paise; (2) the backend returns the order ID and public key to the client; (3) the Razorpay checkout widget opens in the browser; (4) upon successful payment, Razorpay returns payment credentials to the client; (5) the client sends these to the backend /payment/verify endpoint, which computes the expected HMAC-SHA256 signature and compares it to prevent fraud; (6) only after signature verification is the application order created in MongoDB.",
        ),
        spacer(),
        bodyBold("Layered Backend Architecture"),
        body(
          "The backend was structured with explicit separation of concerns: Express Route handlers delegate to Controller methods, which invoke Service layer functions for business logic. Services interact only with Repositories, which encapsulate all Mongoose model operations. This layering means no Controller directly touches a model, and no Service contains query syntax — enabling easy substitution of the data access layer if required.",
        ),
        spacer(),
        bodyBold("Frontend State Management"),
        body(
          "The Zustand cart store persists the cart array to localStorage, enabling cart persistence across browser sessions without requiring a server-side cart for unauthenticated users. The auth store manages JWT tokens via localStorage and exposes a fetchProfile action called on app initialization to restore authenticated session state. This architecture avoids prop drilling and context re-render cascades found in Redux-based solutions.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3.2.2  Testing & Quality Assurance")],
        }),
        body(
          "Testing was conducted through a combination of manual testing, API-level testing via Postman, and browser developer tools inspection:",
        ),
        bullet(
          "API Testing: All 25+ REST endpoints were tested via Postman collections, verifying correct status codes, response payloads, and error responses for invalid inputs, missing auth, and insufficient permissions.",
        ),
        bullet(
          "Role-Based Access Testing: Test accounts for admin, vendor, and customer roles were seeded via the seed.js script. Each protected route was verified with tokens of each role to confirm correct authorization behavior.",
        ),
        bullet(
          "Payment Flow Testing: Razorpay test mode credentials were used to simulate successful payments and payment failures, verifying HMAC signature validation on the backend and correct order creation post-verification.",
        ),
        bullet(
          "Frontend Debugging: Chrome DevTools Network tab was used to inspect API request/response payloads, identify serialization issues, and debug CORS problems. React DevTools were used to inspect component state and store values.",
        ),
        bullet(
          "Database Validation: MongoDB Compass was used to inspect actual stored documents and verify schema constraints, particularly for order item embedding and wishlist $addToSet operations.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3.2.3  DevOps & Deployment")],
        }),
        body(
          "The application was configured for deployment with environment-based configuration managed through dotenv. The backend uses an Environment class that validates required variables (MONGO_URI, JWT_SECRET) on startup and provides graceful error messages for missing configuration. Cloudinary can be configured via either a CLOUDINARY_URL connection string or individual key variables, providing deployment flexibility.",
        ),
        body(
          "The backend was structured to support Vercel serverless deployment (exporting server.app as the default export and conditionally calling server.start() only outside Vercel). The frontend was built with Vite and configured with a dev proxy to /api for local development, enabling the same API call patterns in both development and production environments.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("3.2.4  Fortnightly Milestone Summary")],
        }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [900, 2000, 3000, 3126],
          rows: [
            new TableRow({
              children: [
                thCell("FNR", 900),
                thCell("Period", 2000),
                thCell("Technical Areas", 3000),
                thCell("Major Achievement", 3126),
              ],
            }),
            new TableRow({
              children: [
                tdCell("1", 900, false),
                tdCell("28 Jan–31 Jan", 2000, false),
                tdCell("HTML5, CSS3, Responsive Design", 3000, false),
                tdCell(
                  "Environment configured; responsive layouts delivered",
                  3126,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("2", 900, true),
                tdCell("01 Feb–15 Feb", 2000, true),
                tdCell("Semantic HTML, JavaScript, jQuery", 3000, true),
                tdCell(
                  "Form validation and DOM manipulation implemented",
                  3126,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("3", 900, false),
                tdCell("16 Feb–28 Feb", 2000, false),
                tdCell("JS Interactivity, Debugging", 3000, false),
                tdCell(
                  "Dynamic webpage interactions and error handling",
                  3126,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("4", 900, true),
                tdCell("01 Mar–15 Mar", 2000, true),
                tdCell("Bootstrap, APIs, Local Storage", 3000, true),
                tdCell(
                  "Responsive navigation with Bootstrap components",
                  3126,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("5", 900, false),
                tdCell("16 Mar–31 Mar", 2000, false),
                tdCell("Full Frontend, Deployment", 3000, false),
                tdCell(
                  "Complete SPA with API integration and hosting",
                  3126,
                  false,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("6", 900, true),
                tdCell("01 Apr–15 Apr", 2000, true),
                tdCell("Advanced JS, Components, Security", 3000, true),
                tdCell(
                  "Reusable React components with async/await and JWT",
                  3126,
                  true,
                ),
              ],
            }),
            new TableRow({
              children: [
                tdCell("7", 900, false),
                tdCell("16 Apr–30 Apr", 2000, false),
                tdCell("External APIs, JSON, Multi-page", 3000, false),
                tdCell(
                  "Full-stack MERN e-commerce platform delivered",
                  3126,
                  false,
                ),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Table 3.1: Fortnightly Milestone Summary",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        pageBreak(),

        // ======== CHAPTER 4 ========
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun("Chapter 4: Learning Experience & Skill Acquisition"),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("4.1  Technical Skills Gained")],
        }),
        body(
          "The 14-week internship resulted in significant growth across multiple technical dimensions. The following table summarizes skill levels before and after the internship:",
        ),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [3000, 2000, 2000, 2026],
          rows: [
            new TableRow({
              children: [
                thCell("Skill Area", 3000),
                thCell("Pre-Internship", 2000),
                thCell("Post-Internship", 2000),
                thCell("Key Learning", 2026),
              ],
            }),
            new TableRow({
              children: [
                tdCell("React.js / Vite", 3000, false),
                tdCell("Basic", 2000, false),
                tdCell("Advanced", 2000, false),
                tdCell("Hooks, state, routing, component design", 2026, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Node.js / Express.js", 3000, true),
                tdCell("Beginner", 2000, true),
                tdCell("Intermediate", 2000, true),
                tdCell("Layered APIs, middleware, error handling", 2026, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("MongoDB / Mongoose", 3000, false),
                tdCell("Beginner", 2000, false),
                tdCell("Intermediate", 2000, false),
                tdCell("Schema design, indexes, operators", 2026, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Tailwind CSS", 3000, true),
                tdCell("Beginner", 2000, true),
                tdCell("Advanced", 2000, true),
                tdCell("Utility-first responsive design system", 2026, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("JWT / Auth", 3000, false),
                tdCell("Conceptual", 2000, false),
                tdCell("Practical", 2000, false),
                tdCell("Token lifecycle, role guards, bcrypt", 2026, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Payment Gateway APIs", 3000, true),
                tdCell("None", 2000, true),
                tdCell("Working", 2000, true),
                tdCell("Razorpay flow, HMAC verification", 2026, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Cloud Services (Cloudinary)", 3000, false),
                tdCell("None", 2000, false),
                tdCell("Working", 2000, false),
                tdCell("Image upload, CDN storage, SDK config", 2026, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Git / GitHub", 3000, true),
                tdCell("Basic", 2000, true),
                tdCell("Proficient", 2000, true),
                tdCell("Branching, commits, version management", 2026, true),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Table 4.1: Technical Skills Acquired During Internship",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("4.2  Professional & Soft Skills")],
        }),
        body(
          "Beyond technical proficiency, the internship cultivated several professional competencies essential for a software engineering career:",
        ),
        bullet(
          "Project Structuring: Learning to organize a full-stack project into clear directory structures (frontend/backend separation, feature-based file grouping) and applying naming conventions consistently improved code navigability significantly.",
        ),
        bullet(
          "Documentation Practices: Writing inline comments, maintaining a seed script for reproducible development data, and structuring environment configuration with validation instilled good documentation habits.",
        ),
        bullet(
          "Problem Decomposition: Complex features like the Razorpay payment flow were broken down into sequential, testable steps — a skill directly applicable in Agile sprint planning.",
        ),
        bullet(
          "Debugging Methodology: A systematic approach to debugging was developed: reproduce the issue, isolate the layer (frontend/backend/database), use appropriate tools (DevTools, Postman, console.log, MongoDB Compass), fix the root cause, and verify.",
        ),
        bullet(
          "Independent Research: Regularly consulting official documentation (MDN, MongoDB docs, Razorpay API reference, Cloudinary SDK docs) rather than relying solely on tutorials built self-sufficiency in technical exploration.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("4.3  Challenging Technical Task")],
        }),
        body(
          "The most technically challenging task encountered during the internship was implementing the Cloudinary image upload pipeline in a way that handled multiple input types (base64 data URLs from file uploads, HTTPS URLs from external sources, and already-hosted Cloudinary URLs) without re-uploading or rejecting valid inputs.",
        ),
        body(
          "The specific issue arose when the vendor product creation form allowed both file uploads (converted to base64 locally) and existing URL references. The initial implementation attempted to upload all image inputs to Cloudinary regardless of type, causing two problems: (1) already-hosted Cloudinary URLs were re-uploaded unnecessarily, consuming API quota; (2) external HTTP URLs occasionally caused CORS or content-type errors during Cloudinary upload.",
        ),
        body(
          "The resolution involved implementing a type-detection strategy in the uploadImage() method of ProductService: if the input contains 'res.cloudinary.com', it is returned as-is; if it begins with 'data:image/', it is uploaded to Cloudinary as a base64 string; if it is an HTTPS URL (not already on Cloudinary), it is uploaded by URL reference; if Cloudinary is not configured, external URLs are passed through while base64 uploads are rejected with a meaningful error. This approach was validated through Postman testing with each input type.",
        ),
        body(
          "An additional complication arose with the Cloudinary environment variable configuration: the SDK supports both a CLOUDINARY_URL connection string format and individual CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET variables. The cloudinary.js config module was extended to detect and handle both formats, with a debug log output confirming which configuration path was activated — resolving deployment configuration ambiguities.",
        ),
        pageBreak(),

        // ======== CHAPTER 5 ========
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Chapter 5: Technical Analysis")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun("5.1  SWOT Analysis")],
        }),
        body(
          "The following SWOT analysis evaluates the Tushar Store platform from both a technical capability and market positioning perspective:",
        ),
        spacer(),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [4513, 4513],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders: thinBorders,
                  width: { size: 4513, type: WidthType.DXA },
                  shading: { fill: "DBEAFE", type: ShadingType.CLEAR },
                  margins: { top: 120, bottom: 120, left: 160, right: 160 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: "STRENGTHS",
                          font: "Times New Roman",
                          size: 24,
                          bold: true,
                          color: "1E3A5F",
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 120 },
                      children: [
                        new TextRun({
                          text: "• Full JavaScript ecosystem (MERN) reduces context-switching",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Layered backend architecture enables maintainability",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• JWT + HMAC payment verification provides strong security",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Multi-role system supports diverse stakeholder needs",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Cloudinary CDN ensures fast image delivery globally",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  borders: thinBorders,
                  width: { size: 4513, type: WidthType.DXA },
                  shading: { fill: "FEF9C3", type: ShadingType.CLEAR },
                  margins: { top: 120, bottom: 120, left: 160, right: 160 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: "WEAKNESSES",
                          font: "Times New Roman",
                          size: 24,
                          bold: true,
                          color: "92400E",
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 120 },
                      children: [
                        new TextRun({
                          text: "• No automated test suite; relies on manual testing",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Cart stored in localStorage; lost on device switch",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• No review/rating submission feature for customers",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Single-server deployment lacks horizontal scaling",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• No real-time notifications (WebSocket) for order updates",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  borders: thinBorders,
                  width: { size: 4513, type: WidthType.DXA },
                  shading: { fill: "DCFCE7", type: ShadingType.CLEAR },
                  margins: { top: 120, bottom: 120, left: 160, right: 160 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: "OPPORTUNITIES",
                          font: "Times New Roman",
                          size: 24,
                          bold: true,
                          color: "14532D",
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 120 },
                      children: [
                        new TextRun({
                          text: "• Indian D2C market growing at 45% CAGR (2024 estimates)",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Mobile-first expansion via React Native app",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• AI-powered product recommendations via ML APIs",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Subscription/SaaS model for vendor storefronts",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Integration with logistics APIs (Shiprocket, Delhivery)",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  borders: thinBorders,
                  width: { size: 4513, type: WidthType.DXA },
                  shading: { fill: "FEE2E2", type: ShadingType.CLEAR },
                  margins: { top: 120, bottom: 120, left: 160, right: 160 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: "THREATS",
                          font: "Times New Roman",
                          size: 24,
                          bold: true,
                          color: "7F1D1D",
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 120 },
                      children: [
                        new TextRun({
                          text: "• Competition from established platforms (Amazon, Flipkart)",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• MongoDB free tier limitations under high traffic load",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• OWASP security risks (XSS, injection) without strict sanitization",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Razorpay pricing changes affecting transaction margins",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "• Regulatory compliance (PCI-DSS, data privacy laws)",
                          font: "Times New Roman",
                          size: 22,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: "Table 5.1: SWOT Analysis of Tushar Store Platform",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun(
              "5.2  Technical Problem Identification & Proposed Solution",
            ),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("5.2.1  The Problem")],
        }),
        body(
          "A significant technical bottleneck identified in the current implementation is the absence of server-side cart synchronization. The shopping cart is stored exclusively in the browser's localStorage via the Zustand cart store. While this provides a fast, offline-capable cart experience, it introduces several critical limitations in a production e-commerce context.",
        ),
        body(
          "Additionally, the current implementation fetches product lists without pagination, loading all available products in a single API call (e.g., GET /api/products with no limit/offset parameters). As the product catalog grows, this results in unbounded query sizes, increasing database read times, network payload sizes, and frontend rendering overhead.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("5.2.2  Consequences")],
        }),
        body(
          "The localStorage-only cart presents the following consequences for users and the platform:",
        ),
        bullet(
          "Cart Loss Across Devices: A customer building a cart on their laptop will find an empty cart on their mobile device, creating frustration and potential cart abandonment.",
        ),
        bullet(
          "No Cart Recovery: If a customer clears browser data or switches browsers, their cart is permanently lost with no recovery mechanism.",
        ),
        bullet(
          "Inconsistency Risk: Cart items may reference products that are now out-of-stock or deleted, as the cart is not validated against live inventory on load.",
        ),
        body("The unbounded product loading issue leads to:"),
        bullet(
          "Degraded API Response Times: A query returning 1,000+ products consumes significant MongoDB read resources and increases response payload (potentially exceeding 1MB of JSON).",
        ),
        bullet(
          "Poor UI Performance: Rendering 500+ product cards simultaneously causes layout thrashing and scroll jank on lower-end devices, degrading the customer experience.",
        ),
        bullet(
          "Inability to Scale: Without cursor-based or offset-based pagination, the product API cannot support infinite scroll, lazy loading, or efficient category navigation.",
        ),
        spacer(),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun("5.2.3  Proposed Technical Solution")],
        }),
        body(
          "Two targeted solutions are proposed, each grounded in established software engineering principles:",
        ),
        spacer(),
        bodyBold("Solution A: Server-Side Cart Synchronization"),
        body(
          "The existing Cart model in MongoDB (cart.model.js) and cart repository are already implemented with full CRUD operations. The proposed enhancement is to synchronize the client-side Zustand cart with the server-side cart for authenticated users, while maintaining the localStorage-only approach for guests.",
        ),
        body(
          "Implementation approach: On user login, the Zustand auth store dispatches a cart sync action that fetches the server cart (GET /api/cart) and merges it with the local cart using a conflict resolution strategy (server cart items take precedence for quantity, but local-only items are pushed to the server). On cart mutations (add, remove, update quantity), the action fires both a local state update and an async API call, with optimistic UI updates that roll back on error. On logout, the local cart is cleared and the server cart is preserved.",
        ),
        body(
          "This approach provides cart persistence across devices and sessions while maintaining the fast, optimistic UX of local state management. The existing backend API (already fully implemented) requires no modifications.",
        ),
        spacer(),
        bodyBold("Solution B: Cursor-Based Pagination for Product API"),
        body(
          "The product listing API should be extended to support cursor-based pagination using MongoDB's ObjectId as the cursor. This approach is preferred over offset-based pagination because ObjectIds are monotonically increasing, making them efficient as range queries (find products where _id > lastId, limit N).",
        ),
        body(
          "Implementation approach: The GET /api/products endpoint is extended to accept limit (default 20) and cursor (last _id from previous page) query parameters. The ProductRepository.findAll() method applies a filter of { _id: { $gt: cursor } } when a cursor is provided, with a .limit(limit + 1) to determine if a next page exists. The API response includes a nextCursor field set to the last item's _id if more pages exist, or null if this is the final page.",
        ),
        body(
          "On the frontend, the Products page implements an IntersectionObserver-based infinite scroll that fires fetchAll({ cursor: nextCursor }) when the user scrolls near the bottom, appending new products to the existing list. This reduces initial API payload from potentially hundreds of products to a fixed 20-item batch, dramatically improving time-to-interactive and database read efficiency.",
        ),
        spacer(),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [2800, 3113, 3113],
          rows: [
            new TableRow({
              children: [
                thCell("Metric", 2800),
                thCell("Current State", 3113),
                thCell("After Proposed Solution", 3113),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Cart persistence across devices", 2800, false),
                tdCell("Not supported", 3113, false),
                tdCell("Fully supported for auth users", 3113, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Initial product API payload", 2800, true),
                tdCell("All products (~100KB+)", 3113, true),
                tdCell("20 items per page (~4KB)", 3113, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("MongoDB read cost per request", 2800, false),
                tdCell("Full collection scan", 3113, false),
                tdCell("Bounded range query (index hit)", 3113, false),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Frontend render performance", 2800, true),
                tdCell("All cards at once", 3113, true),
                tdCell("Progressive, scroll-triggered", 3113, true),
              ],
            }),
            new TableRow({
              children: [
                tdCell("Cart accuracy (stock validation)", 2800, false),
                tdCell("No validation on load", 3113, false),
                tdCell("Server validates on sync", 3113, false),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "Table 5.2: Impact Analysis – Current vs Proposed Solution",
              font: "Times New Roman",
              size: 20,
              italics: true,
              bold: true,
            }),
          ],
        }),
        pageBreak(),

        // ======== CHAPTER 6 ========
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Chapter 6: Conclusion")],
        }),
        body(
          "The 14-week internship in e-commerce web application development has been a transformative experience in both technical proficiency and professional growth. Beginning with foundational HTML/CSS responsive layouts and progressing through JavaScript interactivity, Bootstrap-based UI components, and eventually full-stack MERN development, the journey mirrors the learning trajectory of a junior software engineer entering the industry.",
        ),
        body(
          "The final deliverable — Tushar Store — is a production-ready multi-vendor e-commerce platform that demonstrates mastery of the complete application development lifecycle: requirements analysis, database schema design, RESTful API development, frontend component architecture, third-party service integration, and deployment configuration. The platform's layered architecture, role-based access control, HMAC-verified payment flow, and CDN-hosted image management reflect industry-standard engineering practices.",
        ),
        body(
          "The most significant technical lessons from this internship include the importance of separation of concerns in large codebases (evidenced by the Repository→Service→Controller pattern), the value of environment-based configuration for deployment flexibility, and the complexity of integrating third-party payment gateways securely. The challenging Cloudinary image pipeline task reinforced a systematic problem-solving approach: understand the input contracts, handle edge cases explicitly, and validate through targeted testing.",
        ),
        body(
          "From a professional standpoint, the internship instilled habits of independent technical research, documentation-driven development, and the discipline to structure code for future maintainability rather than immediate convenience. The SWOT analysis and technical problem identification exercises in Chapter 5 further developed the analytical thinking required of a software engineer who understands both the technical and business dimensions of a product.",
        ),
        body(
          "Looking ahead, the proposed enhancements — server-side cart synchronization and cursor-based pagination — represent a clear technical roadmap for evolving the platform toward production-scale deployment. The internship has established a strong foundation in full-stack JavaScript development, and the skills acquired are directly applicable to roles in frontend engineering, backend API development, and full-stack software engineering positions across the e-commerce, FinTech, and SaaS sectors.",
        ),
        body(
          "This internship has not only produced a functional software product but has equipped the developer with the mindset, methodologies, and technical vocabulary to contribute meaningfully to professional engineering teams and continue growing as a software engineer.",
        ),
        spacer(),
        spacer(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [
            new TextRun({
              text: "— End of Report —",
              font: "Times New Roman",
              size: 24,
              italics: true,
              color: "6B7280",
            }),
          ],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc)
  .then((buffer) => {
    fs.writeFileSync(
      "/mnt/user-data/outputs/Internship_Report_Tushar_Gour.docx",
      buffer,
    );
    console.log("✓ Report generated successfully!");
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
