"use client"

import { PageHeader } from "@/components/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CadastroColaboradores } from "@/components/cadastro-colaboradores"
import { CadastroMotoboys } from "@/components/cadastro-motoboys"
import { CadastroFornecedores } from "@/components/cadastro-fornecedores"
import { ScheduleParticipationControl } from "@/components/schedule-participation-control"

export function Cadastros() {
  return (
    <div>
      <PageHeader title="Cadastros" description="Gerencie sócios, colaboradores, motoboys e fornecedores." />
      <Tabs defaultValue="socios">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="socios">Sócios</TabsTrigger>
          <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
          <TabsTrigger value="motoboys">Motoboys</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
        </TabsList>
        <TabsContent value="socios" className="mt-4">
          <ScheduleParticipationControl contexto="socios" />
          <CadastroColaboradores contexto="socios" />
        </TabsContent>
        <TabsContent value="colaboradores" className="mt-4">
          <ScheduleParticipationControl contexto="colaboradores" />
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
