export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      abonnements: {
        Row: {
          created_at: string
          date_debut: string
          date_fin: string | null
          entreprise_id: string
          essai_fin: string | null
          id: string
          plan_id: string
          statut: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          entreprise_id: string
          essai_fin?: string | null
          id?: string
          plan_id: string
          statut?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          entreprise_id?: string
          essai_fin?: string | null
          id?: string
          plan_id?: string
          statut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abonnements_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abonnements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans_abonnement"
            referencedColumns: ["id"]
          },
        ]
      }
      amortissements: {
        Row: {
          annee: number
          comptabilise: boolean
          created_at: string
          cumul: number
          dotation: number
          entreprise_id: string
          exercice_id: string | null
          id: string
          immobilisation_id: string
          vnc: number
        }
        Insert: {
          annee: number
          comptabilise?: boolean
          created_at?: string
          cumul?: number
          dotation?: number
          entreprise_id: string
          exercice_id?: string | null
          id?: string
          immobilisation_id: string
          vnc?: number
        }
        Update: {
          annee?: number
          comptabilise?: boolean
          created_at?: string
          cumul?: number
          dotation?: number
          entreprise_id?: string
          exercice_id?: string | null
          id?: string
          immobilisation_id?: string
          vnc?: number
        }
        Relationships: [
          {
            foreignKeyName: "amortissements_immobilisation_id_fkey"
            columns: ["immobilisation_id"]
            isOneToOne: false
            referencedRelation: "immobilisations"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          actif: boolean
          code: string
          compte_achat: string
          compte_stock: string
          compte_variation: string
          compte_vente: string
          created_at: string
          designation: string
          entreprise_id: string
          id: string
          methode_valorisation: string
          notes: string | null
          prix_achat_moyen: number
          quantite_stock: number
          stock_minimum: number
          unite: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          code: string
          compte_achat?: string
          compte_stock?: string
          compte_variation?: string
          compte_vente?: string
          created_at?: string
          designation: string
          entreprise_id: string
          id?: string
          methode_valorisation?: string
          notes?: string | null
          prix_achat_moyen?: number
          quantite_stock?: number
          stock_minimum?: number
          unite?: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          code?: string
          compte_achat?: string
          compte_stock?: string
          compte_variation?: string
          compte_vente?: string
          created_at?: string
          designation?: string
          entreprise_id?: string
          id?: string
          methode_valorisation?: string
          notes?: string | null
          prix_achat_moyen?: number
          quantite_stock?: number
          stock_minimum?: number
          unite?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      axes_analytiques: {
        Row: {
          actif: boolean
          code: string
          created_at: string
          entreprise_id: string
          id: string
          libelle: string
        }
        Insert: {
          actif?: boolean
          code: string
          created_at?: string
          entreprise_id: string
          id?: string
          libelle: string
        }
        Update: {
          actif?: boolean
          code?: string
          created_at?: string
          entreprise_id?: string
          id?: string
          libelle?: string
        }
        Relationships: []
      }
      balance: {
        Row: {
          compte: string
          created_at: string
          entreprise_id: string
          exercice_id: string
          id: string
          intitule: string
          mc: number
          md: number
          sc: number
          sd: number
          sfc: number
          sfd: number
        }
        Insert: {
          compte: string
          created_at?: string
          entreprise_id: string
          exercice_id: string
          id?: string
          intitule: string
          mc?: number
          md?: number
          sc?: number
          sd?: number
          sfc?: number
          sfd?: number
        }
        Update: {
          compte?: string
          created_at?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          intitule?: string
          mc?: number
          md?: number
          sc?: number
          sd?: number
          sfc?: number
          sfd?: number
        }
        Relationships: [
          {
            foreignKeyName: "balance_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          compte: string
          created_at: string
          entreprise_id: string
          exercice_id: string
          id: string
          intitule: string
          mois: number
          montant_budget: number
        }
        Insert: {
          compte: string
          created_at?: string
          entreprise_id: string
          exercice_id: string
          id?: string
          intitule?: string
          mois: number
          montant_budget?: number
        }
        Update: {
          compte?: string
          created_at?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          intitule?: string
          mois?: number
          montant_budget?: number
        }
        Relationships: []
      }
      bulletins_paie: {
        Row: {
          annee: number
          brut: number | null
          cfce: number | null
          charges_patronales: number | null
          comptabilise: boolean
          created_at: string
          css_af: number | null
          css_at: number | null
          employee_id: string
          entreprise_id: string
          exercice_id: string | null
          id: string
          ipm_p: number | null
          ipm_s: number | null
          ipres_rc_p: number | null
          ipres_rc_s: number | null
          ipres_rg_p: number | null
          ipres_rg_s: number | null
          ir: number | null
          mois: number
          net_payer: number | null
          periode: string
          prime_anciennete: number | null
          salaire_base: number | null
          sursalaire: number | null
          total_retenues: number | null
          transport: number | null
          trimf: number | null
          updated_at: string
        }
        Insert: {
          annee: number
          brut?: number | null
          cfce?: number | null
          charges_patronales?: number | null
          comptabilise?: boolean
          created_at?: string
          css_af?: number | null
          css_at?: number | null
          employee_id: string
          entreprise_id: string
          exercice_id?: string | null
          id?: string
          ipm_p?: number | null
          ipm_s?: number | null
          ipres_rc_p?: number | null
          ipres_rc_s?: number | null
          ipres_rg_p?: number | null
          ipres_rg_s?: number | null
          ir?: number | null
          mois: number
          net_payer?: number | null
          periode: string
          prime_anciennete?: number | null
          salaire_base?: number | null
          sursalaire?: number | null
          total_retenues?: number | null
          transport?: number | null
          trimf?: number | null
          updated_at?: string
        }
        Update: {
          annee?: number
          brut?: number | null
          cfce?: number | null
          charges_patronales?: number | null
          comptabilise?: boolean
          created_at?: string
          css_af?: number | null
          css_at?: number | null
          employee_id?: string
          entreprise_id?: string
          exercice_id?: string | null
          id?: string
          ipm_p?: number | null
          ipm_s?: number | null
          ipres_rc_p?: number | null
          ipres_rc_s?: number | null
          ipres_rg_p?: number | null
          ipres_rg_s?: number | null
          ir?: number | null
          mois?: number
          net_payer?: number | null
          periode?: string
          prime_anciennete?: number | null
          salaire_base?: number | null
          sursalaire?: number | null
          total_retenues?: number | null
          transport?: number | null
          trimf?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_paie_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_paie_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_paie_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinet_members: {
        Row: {
          cabinet_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          cabinet_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          cabinet_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cabinet_members_cabinet_id_fkey"
            columns: ["cabinet_id"]
            isOneToOne: false
            referencedRelation: "cabinets"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinets: {
        Row: {
          created_at: string
          id: string
          nom: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nom: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nom?: string
          owner_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          actif: boolean
          adresse: string | null
          code: string
          compte_tiers: string
          created_at: string
          email: string | null
          entreprise_id: string
          id: string
          ninea: string | null
          nom: string
          notes: string | null
          rccm: string | null
          tel: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          code: string
          compte_tiers?: string
          created_at?: string
          email?: string | null
          entreprise_id: string
          id?: string
          ninea?: string | null
          nom: string
          notes?: string | null
          rccm?: string | null
          tel?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          code?: string
          compte_tiers?: string
          created_at?: string
          email?: string | null
          entreprise_id?: string
          id?: string
          ninea?: string | null
          nom?: string
          notes?: string | null
          rccm?: string | null
          tel?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cloture_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entreprise_id: string
          exercice_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entreprise_id: string
          exercice_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entreprise_id?: string
          exercice_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      declarations_tva: {
        Row: {
          created_at: string
          credit_precedent: number
          date_debut: string
          date_fin: string
          entreprise_id: string
          exercice_id: string
          id: string
          periode: string
          statut: string
          tva_a_payer: number
          tva_collectee: number
          tva_deductible: number
          tva_nette: number
        }
        Insert: {
          created_at?: string
          credit_precedent?: number
          date_debut: string
          date_fin: string
          entreprise_id: string
          exercice_id: string
          id?: string
          periode: string
          statut?: string
          tva_a_payer?: number
          tva_collectee?: number
          tva_deductible?: number
          tva_nette?: number
        }
        Update: {
          created_at?: string
          credit_precedent?: number
          date_debut?: string
          date_fin?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          periode?: string
          statut?: string
          tva_a_payer?: number
          tva_collectee?: number
          tva_deductible?: number
          tva_nette?: number
        }
        Relationships: []
      }
      dgid_config: {
        Row: {
          actif: boolean
          certificat: string | null
          created_at: string
          endpoint: string | null
          entreprise_id: string
          id: string
          mode: string
          ninea_transmetteur: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          certificat?: string | null
          created_at?: string
          endpoint?: string | null
          entreprise_id: string
          id?: string
          mode?: string
          ninea_transmetteur?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          certificat?: string | null
          created_at?: string
          endpoint?: string | null
          entreprise_id?: string
          id?: string
          mode?: string
          ninea_transmetteur?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgid_config_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: true
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      dgid_transmissions: {
        Row: {
          action: string
          created_at: string
          entreprise_id: string
          facture_id: string
          id: string
          payload: Json | null
          response: Json | null
          statut: string
        }
        Insert: {
          action: string
          created_at?: string
          entreprise_id: string
          facture_id: string
          id?: string
          payload?: Json | null
          response?: Json | null
          statut: string
        }
        Update: {
          action?: string
          created_at?: string
          entreprise_id?: string
          facture_id?: string
          id?: string
          payload?: Json | null
          response?: Json | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgid_transmissions_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgid_transmissions_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          categorie: string | null
          created_at: string
          depose_par_email: string | null
          description: string | null
          entreprise_id: string
          exercice_id: string | null
          id: string
          mime_type: string | null
          nom: string
          ref_id: string | null
          ref_type: string
          source: string
          statut_validation: string
          storage_path: string
          tags: string[] | null
          taille_octets: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          categorie?: string | null
          created_at?: string
          depose_par_email?: string | null
          description?: string | null
          entreprise_id: string
          exercice_id?: string | null
          id?: string
          mime_type?: string | null
          nom: string
          ref_id?: string | null
          ref_type: string
          source?: string
          statut_validation?: string
          storage_path: string
          tags?: string[] | null
          taille_octets?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          categorie?: string | null
          created_at?: string
          depose_par_email?: string | null
          description?: string | null
          entreprise_id?: string
          exercice_id?: string | null
          id?: string
          mime_type?: string | null
          nom?: string
          ref_id?: string | null
          ref_type?: string
          source?: string
          statut_validation?: string
          storage_path?: string
          tags?: string[] | null
          taille_octets?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      echeances_fiscales: {
        Row: {
          created_at: string
          date_declaration: string | null
          date_limite: string
          date_paiement: string | null
          entreprise_id: string
          exercice_id: string | null
          id: string
          libelle: string
          montant_du: number | null
          montant_paye: number | null
          notes: string | null
          periode: string
          reference_paiement: string | null
          statut: string
          type_declaration: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_declaration?: string | null
          date_limite: string
          date_paiement?: string | null
          entreprise_id: string
          exercice_id?: string | null
          id?: string
          libelle: string
          montant_du?: number | null
          montant_paye?: number | null
          notes?: string | null
          periode: string
          reference_paiement?: string | null
          statut?: string
          type_declaration: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_declaration?: string | null
          date_limite?: string
          date_paiement?: string | null
          entreprise_id?: string
          exercice_id?: string | null
          id?: string
          libelle?: string
          montant_du?: number | null
          montant_paye?: number | null
          notes?: string | null
          periode?: string
          reference_paiement?: string | null
          statut?: string
          type_declaration?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "echeances_fiscales_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "echeances_fiscales_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      echeances_modeles: {
        Row: {
          actif: boolean
          created_at: string
          entreprise_id: string
          id: string
          jour_limite: number
          libelle: string
          periodicite: string
          type_declaration: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          entreprise_id: string
          id?: string
          jour_limite?: number
          libelle: string
          periodicite: string
          type_declaration: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          entreprise_id?: string
          id?: string
          jour_limite?: number
          libelle?: string
          periodicite?: string
          type_declaration?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "echeances_modeles_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      ecriture_lignes: {
        Row: {
          compte: string
          created_at: string
          credit: number
          debit: number
          ecriture_id: string
          entreprise_id: string
          exercice_id: string
          id: string
          intitule: string
          lettrage: string | null
          libelle: string | null
          ordre: number
        }
        Insert: {
          compte: string
          created_at?: string
          credit?: number
          debit?: number
          ecriture_id: string
          entreprise_id: string
          exercice_id: string
          id?: string
          intitule?: string
          lettrage?: string | null
          libelle?: string | null
          ordre?: number
        }
        Update: {
          compte?: string
          created_at?: string
          credit?: number
          debit?: number
          ecriture_id?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          intitule?: string
          lettrage?: string | null
          libelle?: string | null
          ordre?: number
        }
        Relationships: [
          {
            foreignKeyName: "ecriture_lignes_ecriture_id_fkey"
            columns: ["ecriture_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id"]
          },
        ]
      }
      ecriture_sequences: {
        Row: {
          dernier_numero: number
          entreprise_id: string
          exercice_id: string
          journal_code: string
        }
        Insert: {
          dernier_numero?: number
          entreprise_id: string
          exercice_id: string
          journal_code: string
        }
        Update: {
          dernier_numero?: number
          entreprise_id?: string
          exercice_id?: string
          journal_code?: string
        }
        Relationships: []
      }
      ecritures: {
        Row: {
          contrepassation_de: string | null
          contrepasse_par: string | null
          created_at: string
          created_by: string | null
          date_ecriture: string
          document_id: string | null
          entreprise_id: string
          exercice_id: string
          id: string
          journal_code: string
          libelle: string
          motif_annulation: string | null
          numero: string
          numero_sequence: number
          origine: string
          piece: string | null
          statut: string
          total_credit: number
          total_debit: number
          updated_at: string
          valide_le: string | null
          valide_par: string | null
        }
        Insert: {
          contrepassation_de?: string | null
          contrepasse_par?: string | null
          created_at?: string
          created_by?: string | null
          date_ecriture: string
          document_id?: string | null
          entreprise_id: string
          exercice_id: string
          id?: string
          journal_code: string
          libelle: string
          motif_annulation?: string | null
          numero: string
          numero_sequence: number
          origine?: string
          piece?: string | null
          statut?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Update: {
          contrepassation_de?: string | null
          contrepasse_par?: string | null
          created_at?: string
          created_by?: string | null
          date_ecriture?: string
          document_id?: string | null
          entreprise_id?: string
          exercice_id?: string
          id?: string
          journal_code?: string
          libelle?: string
          motif_annulation?: string | null
          numero?: string
          numero_sequence?: number
          origine?: string
          piece?: string | null
          statut?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecritures_contrepassation_de_fkey"
            columns: ["contrepassation_de"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecritures_contrepasse_par_fkey"
            columns: ["contrepasse_par"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecritures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecritures_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecritures_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      ecritures_abonnement: {
        Row: {
          actif: boolean
          created_at: string
          date_debut: string
          date_fin: string | null
          derniere_execution: string | null
          entreprise_id: string
          exercice_id: string
          id: string
          jour_execution: number
          journal_code: string
          libelle: string
          lignes: Json
          periodicite: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          date_debut: string
          date_fin?: string | null
          derniere_execution?: string | null
          entreprise_id: string
          exercice_id: string
          id?: string
          jour_execution?: number
          journal_code?: string
          libelle: string
          lignes?: Json
          periodicite?: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          derniere_execution?: string | null
          entreprise_id?: string
          exercice_id?: string
          id?: string
          jour_execution?: number
          journal_code?: string
          libelle?: string
          lignes?: Json
          periodicite?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          actif: boolean
          adresse: string | null
          categorie: string | null
          contrat: string | null
          convention: string | null
          created_at: string
          date_entree: string | null
          date_naissance: string | null
          date_sortie: string | null
          enfants: number | null
          entreprise_id: string
          femmes: number | null
          fonction: string | null
          id: string
          lieu_naissance: string | null
          matricule: string
          nationalite: string | null
          nom: string
          prenom: string
          salaire_base: number
          sexe: string | null
          situation_famille: string | null
          statut: string | null
          sursalaire: number
          telephone: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          categorie?: string | null
          contrat?: string | null
          convention?: string | null
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          enfants?: number | null
          entreprise_id: string
          femmes?: number | null
          fonction?: string | null
          id?: string
          lieu_naissance?: string | null
          matricule: string
          nationalite?: string | null
          nom: string
          prenom: string
          salaire_base?: number
          sexe?: string | null
          situation_famille?: string | null
          statut?: string | null
          sursalaire?: number
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          categorie?: string | null
          contrat?: string | null
          convention?: string | null
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          enfants?: number | null
          entreprise_id?: string
          femmes?: number | null
          fonction?: string | null
          id?: string
          lieu_naissance?: string | null
          matricule?: string
          nationalite?: string | null
          nom?: string
          prenom?: string
          salaire_base?: number
          sexe?: string | null
          situation_famille?: string | null
          statut?: string | null
          sursalaire?: number
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      entreprises: {
        Row: {
          adresse: string | null
          cabinet_id: string | null
          created_at: string
          forme_juridique: string | null
          id: string
          monnaie: string | null
          ninea: string | null
          nom: string
          rccm: string | null
          secteur: string | null
          sigle: string | null
          tel: string | null
          user_id: string | null
        }
        Insert: {
          adresse?: string | null
          cabinet_id?: string | null
          created_at?: string
          forme_juridique?: string | null
          id?: string
          monnaie?: string | null
          ninea?: string | null
          nom: string
          rccm?: string | null
          secteur?: string | null
          sigle?: string | null
          tel?: string | null
          user_id?: string | null
        }
        Update: {
          adresse?: string | null
          cabinet_id?: string | null
          created_at?: string
          forme_juridique?: string | null
          id?: string
          monnaie?: string | null
          ninea?: string | null
          nom?: string
          rccm?: string | null
          secteur?: string | null
          sigle?: string | null
          tel?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      exercices: {
        Row: {
          annee: number
          created_at: string
          date_debut: string
          date_fin: string
          entreprise_id: string
          id: string
          statut: string
        }
        Insert: {
          annee: number
          created_at?: string
          date_debut: string
          date_fin: string
          entreprise_id: string
          id?: string
          statut?: string
        }
        Update: {
          annee?: number
          created_at?: string
          date_debut?: string
          date_fin?: string
          entreprise_id?: string
          id?: string
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercices_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      facture_lignes: {
        Row: {
          created_at: string
          designation: string
          facture_id: string
          id: string
          montant_ht: number
          ordre: number
          prix_unitaire: number
          quantite: number
          remise_pct: number
        }
        Insert: {
          created_at?: string
          designation: string
          facture_id: string
          id?: string
          montant_ht?: number
          ordre?: number
          prix_unitaire?: number
          quantite?: number
          remise_pct?: number
        }
        Update: {
          created_at?: string
          designation?: string
          facture_id?: string
          id?: string
          montant_ht?: number
          ordre?: number
          prix_unitaire?: number
          quantite?: number
          remise_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "facture_lignes_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
        ]
      }
      factures: {
        Row: {
          client_id: string
          comptabilisee: boolean
          compte_vente: string
          created_at: string
          date_echeance: string | null
          date_facture: string
          date_transmission: string | null
          dgid_error: string | null
          dgid_mode: string
          entreprise_id: string
          exercice_id: string
          hash_certif: string | null
          id: string
          notes: string | null
          numero: string
          objet: string | null
          qr_code: string | null
          statut: string
          statut_dgid: string
          taux_tva: number
          total_ht: number
          total_ttc: number
          total_tva: number
          updated_at: string
          uuid_dgid: string | null
        }
        Insert: {
          client_id: string
          comptabilisee?: boolean
          compte_vente?: string
          created_at?: string
          date_echeance?: string | null
          date_facture?: string
          date_transmission?: string | null
          dgid_error?: string | null
          dgid_mode?: string
          entreprise_id: string
          exercice_id: string
          hash_certif?: string | null
          id?: string
          notes?: string | null
          numero: string
          objet?: string | null
          qr_code?: string | null
          statut?: string
          statut_dgid?: string
          taux_tva?: number
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          updated_at?: string
          uuid_dgid?: string | null
        }
        Update: {
          client_id?: string
          comptabilisee?: boolean
          compte_vente?: string
          created_at?: string
          date_echeance?: string | null
          date_facture?: string
          date_transmission?: string | null
          dgid_error?: string | null
          dgid_mode?: string
          entreprise_id?: string
          exercice_id?: string
          hash_certif?: string | null
          id?: string
          notes?: string | null
          numero?: string
          objet?: string | null
          qr_code?: string | null
          statut?: string
          statut_dgid?: string
          taux_tva?: number
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          updated_at?: string
          uuid_dgid?: string | null
        }
        Relationships: []
      }
      factures_achat: {
        Row: {
          comptabilisee: boolean
          created_at: string
          date_echeance: string | null
          date_facture: string
          date_reception: string | null
          entreprise_id: string
          exercice_id: string
          fournisseur_id: string
          id: string
          montant_paye: number
          notes: string | null
          numero_fournisseur: string | null
          numero_interne: string
          objet: string | null
          piece_journal: string | null
          statut: string
          total_ht: number
          total_ttc: number
          total_tva: number
          updated_at: string
        }
        Insert: {
          comptabilisee?: boolean
          created_at?: string
          date_echeance?: string | null
          date_facture: string
          date_reception?: string | null
          entreprise_id: string
          exercice_id: string
          fournisseur_id: string
          id?: string
          montant_paye?: number
          notes?: string | null
          numero_fournisseur?: string | null
          numero_interne: string
          objet?: string | null
          piece_journal?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          updated_at?: string
        }
        Update: {
          comptabilisee?: boolean
          created_at?: string
          date_echeance?: string | null
          date_facture?: string
          date_reception?: string | null
          entreprise_id?: string
          exercice_id?: string
          fournisseur_id?: string
          id?: string
          montant_paye?: number
          notes?: string | null
          numero_fournisseur?: string | null
          numero_interne?: string
          objet?: string | null
          piece_journal?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factures_achat_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_achat_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_achat_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
        ]
      }
      factures_achat_lignes: {
        Row: {
          compte_charge: string
          created_at: string
          designation: string
          facture_id: string
          id: string
          montant_ht: number
          ordre: number
          prix_unitaire: number
          quantite: number
          taux_tva: number
        }
        Insert: {
          compte_charge?: string
          created_at?: string
          designation: string
          facture_id: string
          id?: string
          montant_ht?: number
          ordre?: number
          prix_unitaire?: number
          quantite?: number
          taux_tva?: number
        }
        Update: {
          compte_charge?: string
          created_at?: string
          designation?: string
          facture_id?: string
          id?: string
          montant_ht?: number
          ordre?: number
          prix_unitaire?: number
          quantite?: number
          taux_tva?: number
        }
        Relationships: [
          {
            foreignKeyName: "factures_achat_lignes_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "factures_achat"
            referencedColumns: ["id"]
          },
        ]
      }
      fournisseurs: {
        Row: {
          actif: boolean
          adresse: string | null
          code: string
          compte_tiers: string
          conditions_reglement: string | null
          created_at: string
          delai_paiement_jours: number | null
          email: string | null
          entreprise_id: string
          id: string
          ninea: string | null
          notes: string | null
          raison_sociale: string
          rccm: string | null
          telephone: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          code: string
          compte_tiers?: string
          conditions_reglement?: string | null
          created_at?: string
          delai_paiement_jours?: number | null
          email?: string | null
          entreprise_id: string
          id?: string
          ninea?: string | null
          notes?: string | null
          raison_sociale: string
          rccm?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          code?: string
          compte_tiers?: string
          conditions_reglement?: string | null
          created_at?: string
          delai_paiement_jours?: number | null
          email?: string | null
          entreprise_id?: string
          id?: string
          ninea?: string | null
          notes?: string | null
          raison_sociale?: string
          rccm?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fournisseurs_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      immobilisations: {
        Row: {
          categorie: string
          code: string
          compte_amort: string | null
          compte_dotation: string | null
          compte_immo: string
          created_at: string
          date_acquisition: string
          date_cession: string | null
          date_mise_service: string | null
          duree_annees: number
          entreprise_id: string
          id: string
          libelle: string
          mode_amortissement: string
          notes: string | null
          prix_cession: number | null
          statut: string
          taux: number | null
          updated_at: string
          valeur_origine: number
          valeur_residuelle: number
        }
        Insert: {
          categorie?: string
          code: string
          compte_amort?: string | null
          compte_dotation?: string | null
          compte_immo: string
          created_at?: string
          date_acquisition: string
          date_cession?: string | null
          date_mise_service?: string | null
          duree_annees?: number
          entreprise_id: string
          id?: string
          libelle: string
          mode_amortissement?: string
          notes?: string | null
          prix_cession?: number | null
          statut?: string
          taux?: number | null
          updated_at?: string
          valeur_origine?: number
          valeur_residuelle?: number
        }
        Update: {
          categorie?: string
          code?: string
          compte_amort?: string | null
          compte_dotation?: string | null
          compte_immo?: string
          created_at?: string
          date_acquisition?: string
          date_cession?: string | null
          date_mise_service?: string | null
          duree_annees?: number
          entreprise_id?: string
          id?: string
          libelle?: string
          mode_amortissement?: string
          notes?: string | null
          prix_cession?: number | null
          statut?: string
          taux?: number | null
          updated_at?: string
          valeur_origine?: number
          valeur_residuelle?: number
        }
        Relationships: []
      }
      invitations: {
        Row: {
          cabinet_id: string
          created_at: string
          email: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        Insert: {
          cabinet_id: string
          created_at?: string
          email: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Update: {
          cabinet_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_cabinet_id_fkey"
            columns: ["cabinet_id"]
            isOneToOne: false
            referencedRelation: "cabinets"
            referencedColumns: ["id"]
          },
        ]
      }
      journal: {
        Row: {
          auxiliaire_libelle: string | null
          compte: string
          compte_auxiliaire: string | null
          created_at: string
          credit: number
          date_ecriture: string
          debit: number
          ecriture_id: string | null
          ecriture_numero: string | null
          entreprise_id: string
          exercice_id: string
          id: string
          intitule: string
          journal_code: string
          libelle: string
          motif_refus: string | null
          piece: string
          soumis_le: string | null
          soumis_par: string | null
          statut_validation: string
          valide_le: string | null
          valide_par: string | null
        }
        Insert: {
          auxiliaire_libelle?: string | null
          compte: string
          compte_auxiliaire?: string | null
          created_at?: string
          credit?: number
          date_ecriture: string
          debit?: number
          ecriture_id?: string | null
          ecriture_numero?: string | null
          entreprise_id: string
          exercice_id: string
          id?: string
          intitule: string
          journal_code: string
          libelle: string
          motif_refus?: string | null
          piece: string
          soumis_le?: string | null
          soumis_par?: string | null
          statut_validation?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Update: {
          auxiliaire_libelle?: string | null
          compte?: string
          compte_auxiliaire?: string | null
          created_at?: string
          credit?: number
          date_ecriture?: string
          debit?: number
          ecriture_id?: string | null
          ecriture_numero?: string | null
          entreprise_id?: string
          exercice_id?: string
          id?: string
          intitule?: string
          journal_code?: string
          libelle?: string
          motif_refus?: string | null
          piece?: string
          soumis_le?: string | null
          soumis_par?: string | null
          statut_validation?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_ecriture_id_fkey"
            columns: ["ecriture_id"]
            isOneToOne: false
            referencedRelation: "ecritures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_audit: {
        Row: {
          action: string
          created_at: string
          entreprise_id: string
          exercice_id: string
          id: string
          journal_id: string | null
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entreprise_id: string
          exercice_id: string
          id?: string
          journal_id?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          journal_id?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_audit_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_audit_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      lettrage: {
        Row: {
          code_lettrage: string
          compte: string
          created_at: string
          date_lettrage: string
          entreprise_id: string
          exercice_id: string
          id: string
          journal_entry_id: string
          montant: number
        }
        Insert: {
          code_lettrage: string
          compte: string
          created_at?: string
          date_lettrage?: string
          entreprise_id: string
          exercice_id: string
          id?: string
          journal_entry_id: string
          montant?: number
        }
        Update: {
          code_lettrage?: string
          compte?: string
          created_at?: string
          date_lettrage?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          journal_entry_id?: string
          montant?: number
        }
        Relationships: []
      }
      medical_access_log: {
        Row: {
          created_at: string
          ecran: string
          id: number
          motif: string | null
          patient_id: string | null
          structure_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          ecran: string
          id?: never
          motif?: string | null
          patient_id?: string | null
          structure_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          ecran?: string
          id?: never
          motif?: string | null
          patient_id?: string | null
          structure_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_access_log_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_audit_log: {
        Row: {
          action: string
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          structure_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          structure_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          structure_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_audit_log_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["medical_role"]
          site_id: string | null
          statut: string
          structure_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["medical_role"]
          site_id?: string | null
          statut?: string
          structure_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["medical_role"]
          site_id?: string | null
          statut?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_invitations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_invitations_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_user_roles: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          role: Database["public"]["Enums"]["medical_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          role: Database["public"]["Enums"]["medical_role"]
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          role?: Database["public"]["Enums"]["medical_role"]
        }
        Relationships: [
          {
            foreignKeyName: "medical_user_roles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "structure_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      mouvements_stock: {
        Row: {
          article_id: string
          created_at: string
          cump_apres: number
          date_mvt: string
          entreprise_id: string
          exercice_id: string | null
          id: string
          montant: number
          notes: string | null
          prix_unitaire: number
          qte_apres: number
          quantite: number
          reference: string | null
          type_mvt: string
        }
        Insert: {
          article_id: string
          created_at?: string
          cump_apres?: number
          date_mvt: string
          entreprise_id: string
          exercice_id?: string | null
          id?: string
          montant?: number
          notes?: string | null
          prix_unitaire?: number
          qte_apres?: number
          quantite: number
          reference?: string | null
          type_mvt: string
        }
        Update: {
          article_id?: string
          created_at?: string
          cump_apres?: number
          date_mvt?: string
          entreprise_id?: string
          exercice_id?: string | null
          id?: string
          montant?: number
          notes?: string | null
          prix_unitaire?: number
          qte_apres?: number
          quantite?: number
          reference?: string | null
          type_mvt?: string
        }
        Relationships: [
          {
            foreignKeyName: "mouvements_stock_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mouvements_stock_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mouvements_stock_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      moyens_paiement: {
        Row: {
          actif: boolean
          compte_associe: string
          created_at: string
          devise: string
          entreprise_id: string
          id: string
          libelle: string
          numero: string | null
          operateur: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          compte_associe: string
          created_at?: string
          devise?: string
          entreprise_id: string
          id?: string
          libelle: string
          numero?: string | null
          operateur: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          compte_associe?: string
          created_at?: string
          devise?: string
          entreprise_id?: string
          id?: string
          libelle?: string
          numero?: string | null
          operateur?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moyens_paiement_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      notes_annexes_data: {
        Row: {
          created_at: string
          entreprise_id: string
          exercice_id: string
          id: string
          note_key: string
          note_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entreprise_id: string
          exercice_id: string
          id?: string
          note_key: string
          note_value?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          note_key?: string
          note_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_annexes_data_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_annexes_data_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entreprise_id: string
          id: string
          lien: string | null
          message: string | null
          meta: Json | null
          read_at: string | null
          titre: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entreprise_id: string
          id?: string
          lien?: string | null
          message?: string | null
          meta?: Json | null
          read_at?: string | null
          titre: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entreprise_id?: string
          id?: string
          lien?: string | null
          message?: string | null
          meta?: Json | null
          read_at?: string | null
          titre?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      paie_parametres: {
        Row: {
          created_at: string
          entreprise_id: string
          id: string
          parametres: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          entreprise_id: string
          id?: string
          parametres?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          entreprise_id?: string
          id?: string
          parametres?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paie_parametres_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: true
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_comptable: {
        Row: {
          actif: boolean
          classe: string
          created_at: string
          entreprise_id: string
          id: string
          intitule: string
          numero: string
          sens: string
          type_compte: string
        }
        Insert: {
          actif?: boolean
          classe: string
          created_at?: string
          entreprise_id: string
          id?: string
          intitule: string
          numero: string
          sens: string
          type_compte: string
        }
        Update: {
          actif?: boolean
          classe?: string
          created_at?: string
          entreprise_id?: string
          id?: string
          intitule?: string
          numero?: string
          sens?: string
          type_compte?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_comptable_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      plans_abonnement: {
        Row: {
          actif: boolean
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          limites: Json
          nom: string
          ordre: number
          periodicite: string
          populaire: boolean
          prix_fcfa: number
          updated_at: string
        }
        Insert: {
          actif?: boolean
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          limites?: Json
          nom: string
          ordre?: number
          periodicite?: string
          populaire?: boolean
          prix_fcfa: number
          updated_at?: string
        }
        Update: {
          actif?: boolean
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          limites?: Json
          nom?: string
          ordre?: number
          periodicite?: string
          populaire?: boolean
          prix_fcfa?: number
          updated_at?: string
        }
        Relationships: []
      }
      portail_acces: {
        Row: {
          actif: boolean
          created_at: string
          derniere_connexion: string | null
          email: string
          entreprise_id: string
          id: string
          nom: string | null
          peut_deposer_documents: boolean
          peut_voir_bilan: boolean
          peut_voir_documents: boolean
          peut_voir_factures: boolean
          peut_voir_resultat: boolean
          updated_at: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          derniere_connexion?: string | null
          email: string
          entreprise_id: string
          id?: string
          nom?: string | null
          peut_deposer_documents?: boolean
          peut_voir_bilan?: boolean
          peut_voir_documents?: boolean
          peut_voir_factures?: boolean
          peut_voir_resultat?: boolean
          updated_at?: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          derniere_connexion?: string | null
          email?: string
          entreprise_id?: string
          id?: string
          nom?: string | null
          peut_deposer_documents?: boolean
          peut_voir_bilan?: boolean
          peut_voir_documents?: boolean
          peut_voir_factures?: boolean
          peut_voir_resultat?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portail_acces_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      provisions: {
        Row: {
          code: string
          compte_dotation: string
          compte_provision: string
          compte_reprise: string
          created_at: string
          date_constitution: string
          date_reprise: string | null
          entreprise_id: string
          exercice_id: string | null
          id: string
          libelle: string
          montant_actuel: number
          montant_initial: number
          nature: string
          notes: string | null
          statut: string
          updated_at: string
        }
        Insert: {
          code: string
          compte_dotation: string
          compte_provision: string
          compte_reprise: string
          created_at?: string
          date_constitution: string
          date_reprise?: string | null
          entreprise_id: string
          exercice_id?: string | null
          id?: string
          libelle: string
          montant_actuel?: number
          montant_initial?: number
          nature: string
          notes?: string | null
          statut?: string
          updated_at?: string
        }
        Update: {
          code?: string
          compte_dotation?: string
          compte_provision?: string
          compte_reprise?: string
          created_at?: string
          date_constitution?: string
          date_reprise?: string | null
          entreprise_id?: string
          exercice_id?: string | null
          id?: string
          libelle?: string
          montant_actuel?: number
          montant_initial?: number
          nature?: string
          notes?: string | null
          statut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisions_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisions_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          actif: boolean
          adresse: string | null
          created_at: string
          id: string
          nom: string
          principal: boolean
          structure_id: string
          telephone: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          created_at?: string
          id?: string
          nom: string
          principal?: boolean
          structure_id: string
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          created_at?: string
          id?: string
          nom?: string
          principal?: boolean
          structure_id?: string
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      structure_memberships: {
        Row: {
          created_at: string
          id: string
          site_id: string | null
          statut: Database["public"]["Enums"]["membership_status"]
          structure_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          site_id?: string | null
          statut?: Database["public"]["Enums"]["membership_status"]
          structure_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          site_id?: string | null
          statut?: Database["public"]["Enums"]["membership_status"]
          structure_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "structure_memberships_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structure_memberships_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      structures: {
        Row: {
          adresse: string | null
          autorisation_exercice: string | null
          created_at: string
          created_by: string
          devise: string
          id: string
          inscription_ordre: string | null
          logo_path: string | null
          ninea: string | null
          nom: string
          rccm: string | null
          telephone: string | null
          theme_medical: Database["public"]["Enums"]["medical_theme"]
          type: Database["public"]["Enums"]["structure_type"]
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          autorisation_exercice?: string | null
          created_at?: string
          created_by: string
          devise?: string
          id?: string
          inscription_ordre?: string | null
          logo_path?: string | null
          ninea?: string | null
          nom: string
          rccm?: string | null
          telephone?: string | null
          theme_medical?: Database["public"]["Enums"]["medical_theme"]
          type: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          autorisation_exercice?: string | null
          created_at?: string
          created_by?: string
          devise?: string
          id?: string
          inscription_ordre?: string | null
          logo_path?: string | null
          ninea?: string | null
          nom?: string
          rccm?: string | null
          telephone?: string | null
          theme_medical?: Database["public"]["Enums"]["medical_theme"]
          type?: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Relationships: []
      }
      transactions_mm: {
        Row: {
          contrepartie: string | null
          created_at: string
          date_operation: string
          entreprise_id: string
          frais: number
          id: string
          journal_id: string | null
          libelle: string | null
          montant: number
          moyen_id: string
          raw_json: Json | null
          reference: string | null
          sens: string
          statut: string
          telephone: string | null
          updated_at: string
        }
        Insert: {
          contrepartie?: string | null
          created_at?: string
          date_operation: string
          entreprise_id: string
          frais?: number
          id?: string
          journal_id?: string | null
          libelle?: string | null
          montant: number
          moyen_id: string
          raw_json?: Json | null
          reference?: string | null
          sens: string
          statut?: string
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          contrepartie?: string | null
          created_at?: string
          date_operation?: string
          entreprise_id?: string
          frais?: number
          id?: string
          journal_id?: string | null
          libelle?: string | null
          montant?: number
          moyen_id?: string
          raw_json?: Json | null
          reference?: string | null
          sens?: string
          statut?: string
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_mm_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_mm_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_mm_moyen_id_fkey"
            columns: ["moyen_id"]
            isOneToOne: false
            referencedRelation: "moyens_paiement"
            referencedColumns: ["id"]
          },
        ]
      }
      tva_parametrage: {
        Row: {
          actif: boolean
          code: string
          compte_tva_collectee: string
          compte_tva_deductible: string
          created_at: string
          entreprise_id: string
          id: string
          libelle: string
          taux: number
        }
        Insert: {
          actif?: boolean
          code: string
          compte_tva_collectee?: string
          compte_tva_deductible?: string
          created_at?: string
          entreprise_id: string
          id?: string
          libelle: string
          taux?: number
        }
        Update: {
          actif?: boolean
          code?: string
          compte_tva_collectee?: string
          compte_tva_deductible?: string
          created_at?: string
          entreprise_id?: string
          id?: string
          libelle?: string
          taux?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          entreprise_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          entreprise_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          entreprise_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
      }
      ventilations_analytiques: {
        Row: {
          axe_id: string
          centre: string
          created_at: string
          entreprise_id: string
          exercice_id: string
          id: string
          journal_entry_id: string
          montant: number
          pourcentage: number
        }
        Insert: {
          axe_id: string
          centre: string
          created_at?: string
          entreprise_id: string
          exercice_id: string
          id?: string
          journal_entry_id: string
          montant?: number
          pourcentage?: number
        }
        Update: {
          axe_id?: string
          centre?: string
          created_at?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          journal_entry_id?: string
          montant?: number
          pourcentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventilations_analytiques_axe_id_fkey"
            columns: ["axe_id"]
            isOneToOne: false
            referencedRelation: "axes_analytiques"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_balance: {
        Row: {
          compte: string | null
          entreprise_id: string | null
          exercice_id: string | null
          intitule: string | null
          mc: number | null
          md: number | null
          sfc: number | null
          sfd: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_medical_invitation: {
        Args: { _invitation_id: string }
        Returns: string
      }
      can_admin_entreprise: {
        Args: { _entreprise_id: string }
        Returns: boolean
      }
      can_write_entreprise: {
        Args: { _entreprise_id: string }
        Returns: boolean
      }
      create_medical_invitation: {
        Args: {
          _email: string
          _role: Database["public"]["Enums"]["medical_role"]
          _site_id?: string
          _structure_id: string
        }
        Returns: string
      }
      create_medical_site: {
        Args: {
          _adresse?: string
          _nom: string
          _principal?: boolean
          _structure_id: string
          _telephone?: string
        }
        Returns: string
      }
      create_medical_structure: {
        Args: {
          _adresse?: string
          _autorisation_exercice?: string
          _inscription_ordre?: string
          _ninea?: string
          _nom: string
          _rccm?: string
          _telephone?: string
          _theme?: Database["public"]["Enums"]["medical_theme"]
          _type: Database["public"]["Enums"]["structure_type"]
        }
        Returns: string
      }
      exercice_est_cloture: { Args: { _exercice_id: string }; Returns: boolean }
      fn_balance: {
        Args: { _entreprise_id: string; _exercice_id: string }
        Returns: {
          compte: string
          intitule: string
          mc: number
          md: number
          sfc: number
          sfd: number
        }[]
      }
      fn_balance_ecarts: {
        Args: { _entreprise_id: string; _exercice_id: string }
        Returns: {
          compte: string
          ecart_credit: number
          ecart_debit: number
          mc_calculee: number
          mc_stockee: number
          md_calculee: number
          md_stockee: number
        }[]
      }
      fn_contrepasser_ecriture: {
        Args: { _ecriture_id: string; _motif: string }
        Returns: string
      }
      fn_creer_ecriture: {
        Args: {
          _date: string
          _entreprise_id: string
          _exercice_id: string
          _journal_code: string
          _libelle: string
          _lignes: Json
          _origine?: string
          _piece?: string
          _statut?: string
        }
        Returns: string
      }
      fn_generer_alertes_echeances: { Args: never; Returns: number }
      fn_refresh_balance: { Args: never; Returns: undefined }
      fn_resync_balance: {
        Args: { _entreprise_id: string; _exercice_id: string }
        Returns: number
      }
      fn_rouvrir_exercice: {
        Args: { _exercice_id: string; _motif: string }
        Returns: undefined
      }
      fn_valider_ecriture: {
        Args: { _ecriture_id: string }
        Returns: undefined
      }
      get_cabinet_role: {
        Args: { _cabinet_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_entreprise_role: {
        Args: { _entreprise_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_entreprise_ids: { Args: { _user_id: string }; Returns: string[] }
      has_medical_role: {
        Args: {
          _role: Database["public"]["Enums"]["medical_role"]
          _structure_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cabinet_member: {
        Args: { _cabinet_id: string; _user_id: string }
        Returns: boolean
      }
      is_structure_admin: { Args: { _structure_id: string }; Returns: boolean }
      is_structure_member: { Args: { _structure_id: string }; Returns: boolean }
      set_medical_theme: {
        Args: {
          _structure_id: string
          _theme: Database["public"]["Enums"]["medical_theme"]
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "comptable" | "lecteur"
      medical_role:
        | "admin_structure"
        | "medecin"
        | "biologiste"
        | "technicien"
        | "preleveur"
        | "secretaire"
        | "caissier"
        | "comptable"
        | "lecteur"
      medical_theme: "clinique" | "laboratoire" | "urgences"
      membership_status: "invite" | "actif" | "suspendu"
      structure_type: "cabinet" | "laboratoire" | "mixte"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "comptable", "lecteur"],
      medical_role: [
        "admin_structure",
        "medecin",
        "biologiste",
        "technicien",
        "preleveur",
        "secretaire",
        "caissier",
        "comptable",
        "lecteur",
      ],
      medical_theme: ["clinique", "laboratoire", "urgences"],
      membership_status: ["invite", "actif", "suspendu"],
      structure_type: ["cabinet", "laboratoire", "mixte"],
    },
  },
} as const
