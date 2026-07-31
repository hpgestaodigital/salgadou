import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { CrudSection } from "@/components/crud-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/cadastros")({
  head: () => ({
    meta: [
      { title: "Cadastros | Salgadou Gestão" },
      {
        name: "description",
        content:
          "Cadastro de colaboradores, motoboys, fornecedores, áreas e tags da Salgadou.",
      },
      { property: "og:title", content: "Cadastros | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Cadastro de colaboradores, motoboys, fornecedores, áreas e tags.",
      },
    ],
  }),
  component: Cadastros,
});

function Cadastros() {
  return (
    <div>
      <PageHeader
        title="Cadastros"
        subtitle="Base de dados de pessoas, parceiros e classificações"
      />
      <Tabs defaultValue="colaboradores">
        <TabsList className="mb-4 flex w-full flex-wrap justify-start">
          <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
          <TabsTrigger value="motoboys">Motoboys</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários internos</TabsTrigger>
          <TabsTrigger value="areas">Áreas e tags</TabsTrigger>
        </TabsList>

        <TabsContent value="colaboradores">
          <CrudSection
            table="employees"
            title="Colaboradores e sócios"
            singular="colaborador"
            fields={[
              { name: "name", label: "Nome", required: true },
              { name: "role", label: "Função" },
              { name: "phone", label: "Telefone", type: "tel" },
              { name: "pix_key", label: "Chave PIX" },
              { name: "daily_rate", label: "Valor da diária", type: "number", defaultValue: 0 },
              { name: "is_partner", label: "É sócio?", type: "switch", hideInTable: true },
              { name: "notes", label: "Observações", type: "textarea", hideInTable: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="motoboys">
          <CrudSection
            table="couriers"
            title="Motoboys"
            singular="motoboy"
            fields={[
              { name: "name", label: "Nome", required: true },
              { name: "phone", label: "Telefone", type: "tel" },
              { name: "pix_key", label: "Chave PIX" },
              {
                name: "default_daily_rate",
                label: "Diária padrão",
                type: "number",
                defaultValue: 0,
              },
              { name: "notes", label: "Observações", type: "textarea", hideInTable: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="fornecedores">
          <CrudSection
            table="suppliers"
            title="Fornecedores"
            singular="fornecedor"
            fields={[
              { name: "name", label: "Nome", required: true },
              { name: "contact_name", label: "Contato" },
              { name: "phone", label: "Telefone", type: "tel" },
              { name: "pix_key", label: "Chave PIX" },
              { name: "category", label: "Categoria" },
              { name: "notes", label: "Observações", type: "textarea", hideInTable: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="usuarios">
          <div className="surface-panel p-6">
            <p className="text-sm text-muted-foreground">
              Usuários internos (sócios com login) são gerenciados na tela dedicada de
              Usuários, onde é possível criar acessos e definir o perfil.
            </p>
            <Link
              to="/usuarios"
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
            >
              Abrir gestão de usuários
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="areas">
          <CrudSection
            table="areas"
            title="Áreas e tags"
            singular="registro"
            fields={[
              { name: "name", label: "Nome", required: true },
              {
                name: "kind",
                label: "Tipo",
                type: "select",
                defaultValue: "area",
                options: [
                  { value: "area", label: "Área" },
                  { value: "tag", label: "Tag" },
                ],
              },
              { name: "color", label: "Cor (hex)", defaultValue: "#F97316" },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
