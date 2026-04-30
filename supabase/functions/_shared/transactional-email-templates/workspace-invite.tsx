/// <reference types="npm:@types/react@18.3.1" />
import * as React from "npm:react@18.3.1";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "npm:@react-email/components@0.0.22";
import type { TemplateEntry } from "./registry.ts";

interface WorkspaceInviteProps {
  workspaceName?: string;
  role?: string;
  acceptUrl?: string;
}

const WorkspaceInviteEmail = ({
  workspaceName = "your team",
  role = "member",
  acceptUrl = "#",
}: WorkspaceInviteProps) => (
  <Html lang="en-GB" dir="ltr">
    <Head />
    <Preview>You've been invited to join {workspaceName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been invited to join <strong>{workspaceName}</strong> as a{" "}
          <strong>{role}</strong>.
        </Text>
        <Button href={acceptUrl} style={button}>
          Join workspace
        </Button>
        <Text style={text}>
          Or copy and paste this link into your browser:
        </Text>
        <Link href={acceptUrl} style={link}>{acceptUrl}</Link>
        <Hr style={hr} />
        <Text style={footer}>
          This invite is single-use and expires in 72 hours. If you weren't
          expecting it, you can safely ignore this email.
        </Text>
        <Text style={footer}>iPrpr by The Speech Coach</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: WorkspaceInviteEmail,
  subject: (data: Record<string, any>) =>
    `You've been invited to join ${data?.workspaceName ?? "a workspace"} on iPrpr`,
  displayName: "Workspace invite",
  previewData: {
    workspaceName: "Acme Recruiting",
    role: "member",
    acceptUrl: "https://example.com/invite/sample-token",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "32px 28px", maxWidth: "560px" };
const h1 = { fontSize: "24px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "600" as const,
  textDecoration: "none" as const,
  display: "inline-block",
  margin: "8px 0 20px",
};
const link = { fontSize: "12px", color: "#0f172a", wordBreak: "break-all" as const };
const hr = { borderColor: "#e2e8f0", margin: "28px 0 16px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: 0 };
