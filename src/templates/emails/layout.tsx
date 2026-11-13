/* oxlint-disable shadcn/no-inline-styles -- Email clients require inline styles. */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components';

export interface ActionEmailProps {
  lang: string;
  heading: string;
  greeting: string;
  body: string;
  footer: string;
  /** Omit for informational emails (no button). */
  action?: { label: string; url: string };
  ignore?: string;
}

export function ActionEmail({
  lang,
  heading,
  greeting,
  body,
  footer,
  action,
  ignore,
}: ActionEmailProps) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{heading}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f4f5',
          fontFamily: 'Arial, Helvetica, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{ backgroundColor: '#ffffff', borderRadius: 8, maxWidth: 480, padding: 32 }}
        >
          <Heading as="h1" style={{ fontSize: 22, margin: '0 0 16px' }}>
            {heading}
          </Heading>
          <Text>{greeting}</Text>
          <Text>{body}</Text>
          {action ? (
            <Button
              href={action.url}
              style={{
                backgroundColor: '#18181b',
                borderRadius: 6,
                color: '#ffffff',
                padding: '12px 20px',
                textDecoration: 'none',
              }}
            >
              {action.label}
            </Button>
          ) : null}
          {action ? (
            <Text style={{ color: '#6b7280', fontSize: 12, wordBreak: 'break-all' }}>
              {action.url}
            </Text>
          ) : null}
          {ignore ? <Text style={{ color: '#6b7280' }}>{ignore}</Text> : null}
          <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 32 }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
