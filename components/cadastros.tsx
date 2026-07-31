"use client"

import { PageHeader } from "@/components/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CadastroColaboradores } from "@/components/cadastro-colaboradores"
import { CadastroMotoboys } from "@/components/cadastro-motoboys"
import { CadastroFornecedores } from "@/components/cadastro-fornecedores"

export function Cadastros() {
  return (
    <div>
      <PageHeader title="Cadastros" description="Gerencie colaboradores, motoboys e fornecedores." />

      <Tabs defaultValue="colaboradores">
        <TabsList>
          <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
          <TabsTrigger value="motoboys">Motoboys</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
        </TabsList>
        <TabsContent value="colaboradores" className="mt-4">
          <CadastroColaboradores />
        </TabsContent>
        <TabsContent value="motoboys" className="mt-4">
          <CadastroMotoboys />
        </TabsContent>
        <TabsContent value="fornecedores" className="mt-4">
          <CadastroFornecedores />
        </TabsContent>
      </Tabs>
    </div>
  )
}
