// Credenciales y URLs centralizadas para todos los tests E2E. Cambiar
// acá si las cuentas de Cognito o el target URL cambian — no buscar
// "lab1.colaborador" en grep, vive en un único lugar.

export const USERS = {
  colaborador: {
    email: "lab1.colaborador@ticke-t.local",
    password: "Lab1ColabPass2026",
    name: "Lab1 Colaborador",
    role: "colaborador" as const,
  },
  agente: {
    email: "lab1.agente@ticke-t.local",
    password: "Lab1AgentePass2026",
    name: "Lab1 Agente",
    role: "agente-n1" as const,
  },
} as const;

// Rutas principales de la SPA — match con app/src/App.tsx
export const ROUTES = {
  login: "/login",
  myTickets: "/mis-tickets",
  myTicketDetail: (id: string) => `/mis-tickets/${id}`,
  create: "/crear",
  queue: "/cola",
  agentTicket: (id: string) => `/agente/ticket/${id}`,
  agentHistory: "/agente/historial",
  createUser: "/crear-usuario",
} as const;
