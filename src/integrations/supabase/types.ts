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
          prime_gardes: number
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
          prime_gardes?: number
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
          prime_gardes?: number
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
      entreprise_modules: {
        Row: {
          actif: boolean
          created_at: string
          date_activation: string | null
          entreprise_id: string
          id: string
          module: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          date_activation?: string | null
          entreprise_id: string
          id?: string
          module: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          date_activation?: string | null
          entreprise_id?: string
          id?: string
          module?: string
        }
        Relationships: [
          {
            foreignKeyName: "entreprise_modules_entreprise_id_fkey"
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
          secteur_activite: string
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
          secteur_activite?: string
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
          secteur_activite?: string
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
          sante_source_id: string | null
          sante_source_type: string | null
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
          sante_source_id?: string | null
          sante_source_type?: string | null
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
          sante_source_id?: string | null
          sante_source_type?: string | null
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
      operations_bancaires: {
        Row: {
          compte: string
          date_operation: string
          entreprise_id: string
          exercice_id: string
          id: string
          journal_id: string | null
          libelle: string
          montant: number
          numero_ligne: number
          rapproche_le: string | null
          rapproche_par: string | null
          reference: string
          releve_id: string
        }
        Insert: {
          compte: string
          date_operation: string
          entreprise_id: string
          exercice_id: string
          id?: string
          journal_id?: string | null
          libelle: string
          montant: number
          numero_ligne: number
          rapproche_le?: string | null
          rapproche_par?: string | null
          reference?: string
          releve_id: string
        }
        Update: {
          compte?: string
          date_operation?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          journal_id?: string | null
          libelle?: string
          montant?: number
          numero_ligne?: number
          rapproche_le?: string | null
          rapproche_par?: string | null
          reference?: string
          releve_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_bancaires_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_bancaires_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_bancaires_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: true
            referencedRelation: "journal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_bancaires_releve_id_fkey"
            columns: ["releve_id"]
            isOneToOne: false
            referencedRelation: "releves_bancaires"
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
          type_plan: string
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
          type_plan?: string
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
          type_plan?: string
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
          jeton: string
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
          jeton?: string
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
          jeton?: string
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
      portail_tentatives: {
        Row: {
          created_at: string
          email: string | null
          entreprise_id: string | null
          id: string
          ip: string
          succes: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          entreprise_id?: string | null
          id?: string
          ip: string
          succes?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          entreprise_id?: string | null
          id?: string
          ip?: string
          succes?: boolean
        }
        Relationships: []
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
      rapprochements_bancaires_audit: {
        Row: {
          action: string
          created_at: string
          entreprise_id: string
          id: string
          journal_id: string
          operation_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entreprise_id: string
          id?: string
          journal_id: string
          operation_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entreprise_id?: string
          id?: string
          journal_id?: string
          operation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapprochements_bancaires_audit_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapprochements_bancaires_audit_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapprochements_bancaires_audit_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations_bancaires"
            referencedColumns: ["id"]
          },
        ]
      }
      releves_bancaires: {
        Row: {
          compte: string
          created_at: string
          created_by: string
          empreinte: string
          entreprise_id: string
          exercice_id: string
          id: string
          nom_fichier: string
          solde_initial: number
        }
        Insert: {
          compte: string
          created_at?: string
          created_by?: string
          empreinte: string
          entreprise_id: string
          exercice_id: string
          id?: string
          nom_fichier: string
          solde_initial?: number
        }
        Update: {
          compte?: string
          created_at?: string
          created_by?: string
          empreinte?: string
          entreprise_id?: string
          exercice_id?: string
          id?: string
          nom_fichier?: string
          solde_initial?: number
        }
        Relationships: [
          {
            foreignKeyName: "releves_bancaires_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releves_bancaires_exercice_id_fkey"
            columns: ["exercice_id"]
            isOneToOne: false
            referencedRelation: "exercices"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_actes: {
        Row: {
          accord_prealable: boolean
          actif: boolean
          categorie: string
          code: string
          created_at: string
          id: string
          libelle: string
          regime_tva: string
          structure_id: string
          tarif: number
          taux_tva: number
        }
        Insert: {
          accord_prealable?: boolean
          actif?: boolean
          categorie?: string
          code: string
          created_at?: string
          id?: string
          libelle: string
          regime_tva?: string
          structure_id: string
          tarif?: number
          taux_tva?: number
        }
        Update: {
          accord_prealable?: boolean
          actif?: boolean
          categorie?: string
          code?: string
          created_at?: string
          id?: string
          libelle?: string
          regime_tva?: string
          structure_id?: string
          tarif?: number
          taux_tva?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_actes_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_analyse_parametres: {
        Row: {
          analyse_id: string
          choix: string[] | null
          code: string
          cq_absent: string
          decimales: number
          formule: string | null
          id: string
          impossible_bas: number | null
          impossible_haut: number | null
          libelle: string
          methode: string | null
          ordre: number
          structure_id: string
          type: string
          unite: string | null
        }
        Insert: {
          analyse_id: string
          choix?: string[] | null
          code: string
          cq_absent?: string
          decimales?: number
          formule?: string | null
          id?: string
          impossible_bas?: number | null
          impossible_haut?: number | null
          libelle: string
          methode?: string | null
          ordre?: number
          structure_id: string
          type?: string
          unite?: string | null
        }
        Update: {
          analyse_id?: string
          choix?: string[] | null
          code?: string
          cq_absent?: string
          decimales?: number
          formule?: string | null
          id?: string
          impossible_bas?: number | null
          impossible_haut?: number | null
          libelle?: string
          methode?: string | null
          ordre?: number
          structure_id?: string
          type?: string
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_analyse_parametres_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "sante_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_analyse_parametres_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_analyse_reactifs: {
        Row: {
          analyse_id: string
          created_at: string
          id: string
          quantite_par_test: number
          reactif_id: string
          structure_id: string
        }
        Insert: {
          analyse_id: string
          created_at?: string
          id?: string
          quantite_par_test: number
          reactif_id: string
          structure_id: string
        }
        Update: {
          analyse_id?: string
          created_at?: string
          id?: string
          quantite_par_test?: number
          reactif_id?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_analyse_reactifs_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "sante_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_analyse_reactifs_reactif_id_fkey"
            columns: ["reactif_id"]
            isOneToOne: false
            referencedRelation: "sante_reactifs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_analyse_reactifs_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_analyses: {
        Row: {
          accord_prealable: boolean
          actif: boolean
          code: string
          created_at: string
          delai_heures: number
          echantillon: string | null
          id: string
          jeune: boolean
          libelle: string
          regime_tva: string
          section: string
          sensible: boolean
          sous_traitee: boolean
          structure_id: string
          tarif: number
          taux_tva: number
          tube: string | null
        }
        Insert: {
          accord_prealable?: boolean
          actif?: boolean
          code: string
          created_at?: string
          delai_heures?: number
          echantillon?: string | null
          id?: string
          jeune?: boolean
          libelle: string
          regime_tva?: string
          section: string
          sensible?: boolean
          sous_traitee?: boolean
          structure_id: string
          tarif?: number
          taux_tva?: number
          tube?: string | null
        }
        Update: {
          accord_prealable?: boolean
          actif?: boolean
          code?: string
          created_at?: string
          delai_heures?: number
          echantillon?: string | null
          id?: string
          jeune?: boolean
          libelle?: string
          regime_tva?: string
          section?: string
          sensible?: boolean
          sous_traitee?: boolean
          structure_id?: string
          tarif?: number
          taux_tva?: number
          tube?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_analyses_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_antecedents: {
        Row: {
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          libelle: string
          patient_id: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          libelle: string
          patient_id: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          libelle?: string
          patient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_antecedents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_antibiogrammes: {
        Row: {
          antibiotique: string
          cmi: string | null
          germe_id: string
          id: string
          interpretation: string
          structure_id: string
        }
        Insert: {
          antibiotique: string
          cmi?: string | null
          germe_id: string
          id?: string
          interpretation: string
          structure_id: string
        }
        Update: {
          antibiotique?: string
          cmi?: string | null
          germe_id?: string
          id?: string
          interpretation?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_antibiogrammes_germe_id_fkey"
            columns: ["germe_id"]
            isOneToOne: false
            referencedRelation: "sante_micro_germes"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_blocs_secours: {
        Row: {
          annee: number
          created_at: string
          created_by: string | null
          debut: number
          fin: number
          id: string
          poste: string
          structure_id: string
        }
        Insert: {
          annee: number
          created_at?: string
          created_by?: string | null
          debut: number
          fin: number
          id?: string
          poste: string
          structure_id: string
        }
        Update: {
          annee?: number
          created_at?: string
          created_by?: string | null
          debut?: number
          fin?: number
          id?: string
          poste?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_blocs_secours_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_bons_pec: {
        Row: {
          accord_prealable: boolean
          consomme: number
          created_at: string
          created_by: string | null
          date_debut: string
          date_fin: string
          id: string
          numero: string
          organisme: string
          patient_id: string
          plafond: number | null
          structure_id: string
        }
        Insert: {
          accord_prealable?: boolean
          consomme?: number
          created_at?: string
          created_by?: string | null
          date_debut?: string
          date_fin: string
          id?: string
          numero: string
          organisme: string
          patient_id: string
          plafond?: number | null
          structure_id: string
        }
        Update: {
          accord_prealable?: boolean
          consomme?: number
          created_at?: string
          created_by?: string | null
          date_debut?: string
          date_fin?: string
          id?: string
          numero?: string
          organisme?: string
          patient_id?: string
          plafond?: number | null
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_bons_pec_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_bons_pec_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_bris_glace: {
        Row: {
          commentaire_revue: string | null
          created_at: string
          escalade_le: string | null
          expire_le: string
          id: string
          motif: string
          motif_code: string | null
          patient_id: string
          revu_le: string | null
          revu_par: string | null
          structure_id: string
          user_id: string
        }
        Insert: {
          commentaire_revue?: string | null
          created_at?: string
          escalade_le?: string | null
          expire_le?: string
          id?: string
          motif: string
          motif_code?: string | null
          patient_id: string
          revu_le?: string | null
          revu_par?: string | null
          structure_id: string
          user_id: string
        }
        Update: {
          commentaire_revue?: string | null
          created_at?: string
          escalade_le?: string | null
          expire_le?: string
          id?: string
          motif?: string
          motif_code?: string | null
          patient_id?: string
          revu_le?: string | null
          revu_par?: string | null
          structure_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_bris_glace_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_bris_glace_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_catalogue_medicaments: {
        Row: {
          actif: boolean
          created_at: string
          dci: string
          dosage: string | null
          dose_max_pediatrique_mg_kg: number | null
          forme: string | null
          id: string
          nom_commercial: string | null
          structure_id: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          dci: string
          dosage?: string | null
          dose_max_pediatrique_mg_kg?: number | null
          forme?: string | null
          id?: string
          nom_commercial?: string | null
          structure_id: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          dci?: string
          dosage?: string | null
          dose_max_pediatrique_mg_kg?: number | null
          forme?: string | null
          id?: string
          nom_commercial?: string | null
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_catalogue_medicaments_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_certificats: {
        Row: {
          consultation_id: string
          contenu: string
          emis_le: string
          emis_par: string | null
          id: string
          jours_arret: number | null
          numero: string
          patient_id: string
          praticien_id: string
          structure_id: string
          type: string
        }
        Insert: {
          consultation_id: string
          contenu: string
          emis_le?: string
          emis_par?: string | null
          id?: string
          jours_arret?: number | null
          numero: string
          patient_id: string
          praticien_id: string
          structure_id: string
          type: string
        }
        Update: {
          consultation_id?: string
          contenu?: string
          emis_le?: string
          emis_par?: string | null
          id?: string
          jours_arret?: number | null
          numero?: string
          patient_id?: string
          praticien_id?: string
          structure_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_certificats_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "sante_consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_certificats_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_certificats_praticien_id_fkey"
            columns: ["praticien_id"]
            isOneToOne: false
            referencedRelation: "sante_praticiens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_certificats_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_compta_evenements: {
        Row: {
          created_at: string
          date_piece: string
          derniere_erreur: string | null
          ecriture_id: string | null
          id: string
          journal: string
          libelle: string
          lignes: Json
          piece: string | null
          source_id: string
          source_type: string
          statut: string
          structure_id: string
          tentatives: number
          traite_le: string | null
        }
        Insert: {
          created_at?: string
          date_piece: string
          derniere_erreur?: string | null
          ecriture_id?: string | null
          id?: string
          journal: string
          libelle: string
          lignes: Json
          piece?: string | null
          source_id: string
          source_type: string
          statut?: string
          structure_id: string
          tentatives?: number
          traite_le?: string | null
        }
        Update: {
          created_at?: string
          date_piece?: string
          derniere_erreur?: string | null
          ecriture_id?: string | null
          id?: string
          journal?: string
          libelle?: string
          lignes?: Json
          piece?: string | null
          source_id?: string
          source_type?: string
          statut?: string
          structure_id?: string
          tentatives?: number
          traite_le?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_compta_evenements_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_compta_liens: {
        Row: {
          created_at: string
          ecriture_id: string | null
          erreur: string | null
          id: string
          source_id: string
          source_type: string
          statut: string
          structure_id: string
        }
        Insert: {
          created_at?: string
          ecriture_id?: string | null
          erreur?: string | null
          id?: string
          source_id: string
          source_type: string
          statut: string
          structure_id: string
        }
        Update: {
          created_at?: string
          ecriture_id?: string | null
          erreur?: string | null
          id?: string
          source_id?: string
          source_type?: string
          statut?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_compta_liens_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_comptes_parametres: {
        Row: {
          cle: string
          compte: string
          id: string
          structure_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cle: string
          compte: string
          id?: string
          structure_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cle?: string
          compte?: string
          id?: string
          structure_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_comptes_parametres_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_consentements: {
        Row: {
          accorde: boolean
          created_at: string
          id: string
          patient_id: string
          preuve: string | null
          recueilli_par: string | null
          signataire_nom: string | null
          signataire_qualite: string | null
          signature_png: string | null
          signature_sha256: string | null
          texte: string | null
          texte_sha256: string | null
          type: string
          version_texte: string
        }
        Insert: {
          accorde: boolean
          created_at?: string
          id?: string
          patient_id: string
          preuve?: string | null
          recueilli_par?: string | null
          signataire_nom?: string | null
          signataire_qualite?: string | null
          signature_png?: string | null
          signature_sha256?: string | null
          texte?: string | null
          texte_sha256?: string | null
          type: string
          version_texte: string
        }
        Update: {
          accorde?: boolean
          created_at?: string
          id?: string
          patient_id?: string
          preuve?: string | null
          recueilli_par?: string | null
          signataire_nom?: string | null
          signataire_qualite?: string | null
          signature_png?: string | null
          signature_sha256?: string | null
          texte?: string | null
          texte_sha256?: string | null
          type?: string
          version_texte?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_consentements_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_conservation_regles: {
        Row: {
          duree_annees: number
          id: string
          structure_id: string
          type_document: string
          updated_at: string
        }
        Insert: {
          duree_annees?: number
          id?: string
          structure_id: string
          type_document: string
          updated_at?: string
        }
        Update: {
          duree_annees?: number
          id?: string
          structure_id?: string
          type_document?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_conservation_regles_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_consommations_reactifs: {
        Row: {
          analyse_id: string
          created_at: string
          created_by: string | null
          demande_id: string
          id: string
          lot_id: string | null
          quantite: number
          reactif_id: string
          rupture: boolean
          structure_id: string
        }
        Insert: {
          analyse_id: string
          created_at?: string
          created_by?: string | null
          demande_id: string
          id?: string
          lot_id?: string | null
          quantite: number
          reactif_id: string
          rupture?: boolean
          structure_id: string
        }
        Update: {
          analyse_id?: string
          created_at?: string
          created_by?: string | null
          demande_id?: string
          id?: string
          lot_id?: string | null
          quantite?: number
          reactif_id?: string
          rupture?: boolean
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_consommations_reactifs_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "sante_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consommations_reactifs_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consommations_reactifs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "sante_lots_reactifs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consommations_reactifs_reactif_id_fkey"
            columns: ["reactif_id"]
            isOneToOne: false
            referencedRelation: "sante_reactifs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consommations_reactifs_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_constantes: {
        Row: {
          consultation_id: string
          created_at: string
          glycemie: number | null
          id: string
          mesure_par: string | null
          patient_id: string
          poids: number | null
          pouls: number | null
          spo2: number | null
          ta_dia: number | null
          ta_sys: number | null
          taille: number | null
          temperature: number | null
        }
        Insert: {
          consultation_id: string
          created_at?: string
          glycemie?: number | null
          id?: string
          mesure_par?: string | null
          patient_id: string
          poids?: number | null
          pouls?: number | null
          spo2?: number | null
          ta_dia?: number | null
          ta_sys?: number | null
          taille?: number | null
          temperature?: number | null
        }
        Update: {
          consultation_id?: string
          created_at?: string
          glycemie?: number | null
          id?: string
          mesure_par?: string | null
          patient_id?: string
          poids?: number | null
          pouls?: number | null
          spo2?: number | null
          ta_dia?: number | null
          ta_sys?: number | null
          taille?: number | null
          temperature?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_constantes_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "sante_consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_constantes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_consultation_addenda: {
        Row: {
          auteur: string
          consultation_id: string
          created_at: string
          id: string
          patient_id: string
          texte: string
        }
        Insert: {
          auteur?: string
          consultation_id: string
          created_at?: string
          id?: string
          patient_id: string
          texte: string
        }
        Update: {
          auteur?: string
          consultation_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          texte?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_consultation_addenda_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "sante_consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consultation_addenda_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_consultations: {
        Row: {
          anamnese: string | null
          cloturee_le: string | null
          cloturee_par: string | null
          conduite: string | null
          created_at: string
          created_by: string | null
          diagnostic: string | null
          examen: string | null
          id: string
          motif: string | null
          patient_id: string
          praticien_id: string
          rdv_id: string | null
          statut: string
          structure_id: string
          updated_at: string
        }
        Insert: {
          anamnese?: string | null
          cloturee_le?: string | null
          cloturee_par?: string | null
          conduite?: string | null
          created_at?: string
          created_by?: string | null
          diagnostic?: string | null
          examen?: string | null
          id?: string
          motif?: string | null
          patient_id: string
          praticien_id: string
          rdv_id?: string | null
          statut?: string
          structure_id: string
          updated_at?: string
        }
        Update: {
          anamnese?: string | null
          cloturee_le?: string | null
          cloturee_par?: string | null
          conduite?: string | null
          created_at?: string
          created_by?: string | null
          diagnostic?: string | null
          examen?: string | null
          id?: string
          motif?: string | null
          patient_id?: string
          praticien_id?: string
          rdv_id?: string | null
          statut?: string
          structure_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consultations_praticien_id_fkey"
            columns: ["praticien_id"]
            isOneToOne: false
            referencedRelation: "sante_praticiens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consultations_rdv_id_fkey"
            columns: ["rdv_id"]
            isOneToOne: false
            referencedRelation: "sante_rendez_vous"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_consultations_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_controles_qualite: {
        Row: {
          actif: boolean
          automate: string | null
          cible: number
          created_at: string
          ecart_type: number
          id: string
          lot: string
          niveau: string
          parametre_id: string
          structure_id: string
        }
        Insert: {
          actif?: boolean
          automate?: string | null
          cible: number
          created_at?: string
          ecart_type: number
          id?: string
          lot: string
          niveau?: string
          parametre_id: string
          structure_id: string
        }
        Update: {
          actif?: boolean
          automate?: string | null
          cible?: number
          created_at?: string
          ecart_type?: number
          id?: string
          lot?: string
          niveau?: string
          parametre_id?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_controles_qualite_parametre_id_fkey"
            columns: ["parametre_id"]
            isOneToOne: false
            referencedRelation: "sante_analyse_parametres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_controles_qualite_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_convention_exclusions: {
        Row: {
          code: string
          id: string
          organisme: string
          structure_id: string
        }
        Insert: {
          code: string
          id?: string
          organisme: string
          structure_id: string
        }
        Update: {
          code?: string
          id?: string
          organisme?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_convention_exclusions_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_conventions: {
        Row: {
          categorie: string
          created_at: string
          date_debut: string | null
          date_fin: string | null
          franchise: number
          id: string
          organisme: string
          plafond: number | null
          structure_id: string
          taux: number
        }
        Insert: {
          categorie: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          franchise?: number
          id?: string
          organisme: string
          plafond?: number | null
          structure_id: string
          taux: number
        }
        Update: {
          categorie?: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          franchise?: number
          id?: string
          organisme?: string
          plafond?: number | null
          structure_id?: string
          taux?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_conventions_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_cq_mesures: {
        Row: {
          controle_id: string
          id: string
          regles: string[]
          saisi_le: string
          saisi_par: string
          statut: string
          structure_id: string
          valeur: number
          z: number
        }
        Insert: {
          controle_id: string
          id?: string
          regles?: string[]
          saisi_le?: string
          saisi_par: string
          statut: string
          structure_id: string
          valeur: number
          z: number
        }
        Update: {
          controle_id?: string
          id?: string
          regles?: string[]
          saisi_le?: string
          saisi_par?: string
          statut?: string
          structure_id?: string
          valeur?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_cq_mesures_controle_id_fkey"
            columns: ["controle_id"]
            isOneToOne: false
            referencedRelation: "sante_controles_qualite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_cq_mesures_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_cron_config: {
        Row: {
          id: number
          jeton: string
        }
        Insert: {
          id?: number
          jeton?: string
        }
        Update: {
          id?: number
          jeton?: string
        }
        Relationships: []
      }
      sante_demande_analyses: {
        Row: {
          analyse_id: string
          demande_id: string
          id: string
          structure_id: string
          tarif: number
        }
        Insert: {
          analyse_id: string
          demande_id: string
          id?: string
          structure_id: string
          tarif?: number
        }
        Update: {
          analyse_id?: string
          demande_id?: string
          id?: string
          structure_id?: string
          tarif?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_demande_analyses_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "sante_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_demande_analyses_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_demande_analyses_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_demandes_labo: {
        Row: {
          consultation_id: string | null
          cr_hash: string | null
          cr_token: string | null
          created_at: string
          created_by: string | null
          demande_origine_id: string | null
          derogation: boolean
          echantillon_elimine_le: string | null
          grossesse: boolean
          id: string
          motif_rejet: string | null
          motif_rejet_code: string | null
          numero: string
          patient_id: string
          prelev_conditions: Json | null
          prelev_identifiants: string[] | null
          prelev_site: string | null
          preleve_le: string | null
          preleve_par: string | null
          prescripteur: string | null
          recue_le: string | null
          renseignements: string | null
          statut: string
          structure_id: string
          urgence: boolean
          validee_le: string | null
          validee_par: string | null
          validee_tech_le: string | null
          validee_tech_par: string | null
          version: number
        }
        Insert: {
          consultation_id?: string | null
          cr_hash?: string | null
          cr_token?: string | null
          created_at?: string
          created_by?: string | null
          demande_origine_id?: string | null
          derogation?: boolean
          echantillon_elimine_le?: string | null
          grossesse?: boolean
          id?: string
          motif_rejet?: string | null
          motif_rejet_code?: string | null
          numero: string
          patient_id: string
          prelev_conditions?: Json | null
          prelev_identifiants?: string[] | null
          prelev_site?: string | null
          preleve_le?: string | null
          preleve_par?: string | null
          prescripteur?: string | null
          recue_le?: string | null
          renseignements?: string | null
          statut?: string
          structure_id: string
          urgence?: boolean
          validee_le?: string | null
          validee_par?: string | null
          validee_tech_le?: string | null
          validee_tech_par?: string | null
          version?: number
        }
        Update: {
          consultation_id?: string | null
          cr_hash?: string | null
          cr_token?: string | null
          created_at?: string
          created_by?: string | null
          demande_origine_id?: string | null
          derogation?: boolean
          echantillon_elimine_le?: string | null
          grossesse?: boolean
          id?: string
          motif_rejet?: string | null
          motif_rejet_code?: string | null
          numero?: string
          patient_id?: string
          prelev_conditions?: Json | null
          prelev_identifiants?: string[] | null
          prelev_site?: string | null
          preleve_le?: string | null
          preleve_par?: string | null
          prescripteur?: string | null
          recue_le?: string | null
          renseignements?: string | null
          statut?: string
          structure_id?: string
          urgence?: boolean
          validee_le?: string | null
          validee_par?: string | null
          validee_tech_le?: string | null
          validee_tech_par?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_demandes_labo_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "sante_consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_demandes_labo_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_demandes_labo_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_dispensations: {
        Row: {
          article_id: string
          consultation_id: string
          created_at: string
          created_by: string | null
          id: string
          montant: number
          mouvement_id: string | null
          patient_id: string
          prix_unitaire: number
          quantite: number
          structure_id: string
        }
        Insert: {
          article_id: string
          consultation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          montant?: number
          mouvement_id?: string | null
          patient_id: string
          prix_unitaire?: number
          quantite: number
          structure_id: string
        }
        Update: {
          article_id?: string
          consultation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          montant?: number
          mouvement_id?: string | null
          patient_id?: string
          prix_unitaire?: number
          quantite?: number
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_dispensations_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_dispensations_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "sante_consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_dispensations_mouvement_id_fkey"
            columns: ["mouvement_id"]
            isOneToOne: false
            referencedRelation: "mouvements_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_dispensations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_dispensations_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_documents_patient: {
        Row: {
          categorie: string
          created_at: string
          id: string
          mime_type: string | null
          nom: string
          patient_id: string
          storage_path: string
          structure_id: string
          taille_octets: number | null
          uploaded_by: string | null
        }
        Insert: {
          categorie?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          nom: string
          patient_id: string
          storage_path: string
          structure_id: string
          taille_octets?: number | null
          uploaded_by?: string | null
        }
        Update: {
          categorie?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          nom?: string
          patient_id?: string
          storage_path?: string
          structure_id?: string
          taille_octets?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_documents_patient_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_documents_patient_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_eeq: {
        Row: {
          analyse_libelle: string
          campagne: string
          date_campagne: string
          ecart_type: number
          id: string
          non_conformite_id: string | null
          organisme: string
          saisi_le: string
          saisi_par: string | null
          structure_id: string
          valeur_cible: number
          valeur_obtenue: number
          zscore: number | null
        }
        Insert: {
          analyse_libelle: string
          campagne: string
          date_campagne?: string
          ecart_type: number
          id?: string
          non_conformite_id?: string | null
          organisme: string
          saisi_le?: string
          saisi_par?: string | null
          structure_id: string
          valeur_cible: number
          valeur_obtenue: number
          zscore?: number | null
        }
        Update: {
          analyse_libelle?: string
          campagne?: string
          date_campagne?: string
          ecart_type?: number
          id?: string
          non_conformite_id?: string | null
          organisme?: string
          saisi_le?: string
          saisi_par?: string | null
          structure_id?: string
          valeur_cible?: number
          valeur_obtenue?: number
          zscore?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_eeq_non_conformite_id_fkey"
            columns: ["non_conformite_id"]
            isOneToOne: false
            referencedRelation: "sante_non_conformites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_eeq_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_encaissements: {
        Row: {
          created_at: string
          created_by: string | null
          facture_id: string
          id: string
          mode: string
          montant: number
          reference: string | null
          session_id: string | null
          structure_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          facture_id: string
          id?: string
          mode: string
          montant: number
          reference?: string | null
          session_id?: string | null
          structure_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          facture_id?: string
          id?: string
          mode?: string
          montant?: number
          reference?: string | null
          session_id?: string | null
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_encaissements_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_encaissements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sante_sessions_caisse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_encaissements_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_facturation_sources: {
        Row: {
          actif: boolean
          created_at: string
          facture_compta_id: string | null
          facture_id: string | null
          id: string
          source_id: string
          source_type: string
          structure_id: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          facture_compta_id?: string | null
          facture_id?: string | null
          id?: string
          source_id: string
          source_type: string
          structure_id: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          facture_compta_id?: string | null
          facture_id?: string | null
          id?: string
          source_id?: string
          source_type?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_facturation_sources_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_facturation_sources_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_facture_lignes: {
        Row: {
          categorie: string | null
          code: string | null
          facture_id: string
          id: string
          libelle: string
          montant: number
          montant_tva: number
          part_organisme: number
          prix_unitaire: number
          quantite: number
          structure_id: string
          taux_tva: number
        }
        Insert: {
          categorie?: string | null
          code?: string | null
          facture_id: string
          id?: string
          libelle: string
          montant: number
          montant_tva?: number
          part_organisme?: number
          prix_unitaire: number
          quantite?: number
          structure_id: string
          taux_tva?: number
        }
        Update: {
          categorie?: string | null
          code?: string | null
          facture_id?: string
          id?: string
          libelle?: string
          montant?: number
          montant_tva?: number
          part_organisme?: number
          prix_unitaire?: number
          quantite?: number
          structure_id?: string
          taux_tva?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_facture_lignes_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_factures: {
        Row: {
          annulee: boolean
          bon_id: string | null
          consultation_id: string | null
          created_at: string
          created_by: string | null
          demande_id: string | null
          envoye_tiers_le: string | null
          facture_origine_id: string | null
          facture_secours: boolean
          id: string
          montant_tva: number
          motif_remise: string | null
          numero: string
          organisme: string | null
          part_organisme: number
          part_patient: number
          patient_id: string
          praticien_id: string | null
          remise: number
          site_id: string | null
          statut_tiers: string
          structure_id: string
          taux_couverture: number
          total: number
          type: string
        }
        Insert: {
          annulee?: boolean
          bon_id?: string | null
          consultation_id?: string | null
          created_at?: string
          created_by?: string | null
          demande_id?: string | null
          envoye_tiers_le?: string | null
          facture_origine_id?: string | null
          facture_secours?: boolean
          id?: string
          montant_tva?: number
          motif_remise?: string | null
          numero: string
          organisme?: string | null
          part_organisme?: number
          part_patient: number
          patient_id: string
          praticien_id?: string | null
          remise?: number
          site_id?: string | null
          statut_tiers?: string
          structure_id: string
          taux_couverture?: number
          total: number
          type?: string
        }
        Update: {
          annulee?: boolean
          bon_id?: string | null
          consultation_id?: string | null
          created_at?: string
          created_by?: string | null
          demande_id?: string | null
          envoye_tiers_le?: string | null
          facture_origine_id?: string | null
          facture_secours?: boolean
          id?: string
          montant_tva?: number
          motif_remise?: string | null
          numero?: string
          organisme?: string | null
          part_organisme?: number
          part_patient?: number
          patient_id?: string
          praticien_id?: string | null
          remise?: number
          site_id?: string | null
          statut_tiers?: string
          structure_id?: string
          taux_couverture?: number
          total?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_factures_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "sante_consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_factures_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_factures_facture_origine_id_fkey"
            columns: ["facture_origine_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_factures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_factures_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_fusions: {
        Row: {
          annule_le: string | null
          annule_par: string | null
          confirme_le: string | null
          confirme_par: string | null
          created_at: string
          fusionne_par: string
          id: string
          motif: string
          motif_annulation: string | null
          patient_conserve: string
          patient_fusionne: string
          snapshot: Json | null
          statut: string
          structure_id: string
        }
        Insert: {
          annule_le?: string | null
          annule_par?: string | null
          confirme_le?: string | null
          confirme_par?: string | null
          created_at?: string
          fusionne_par: string
          id?: string
          motif: string
          motif_annulation?: string | null
          patient_conserve: string
          patient_fusionne: string
          snapshot?: Json | null
          statut?: string
          structure_id: string
        }
        Update: {
          annule_le?: string | null
          annule_par?: string | null
          confirme_le?: string | null
          confirme_par?: string | null
          created_at?: string
          fusionne_par?: string
          id?: string
          motif?: string
          motif_annulation?: string | null
          patient_conserve?: string
          patient_fusionne?: string
          snapshot?: Json | null
          statut?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_fusions_patient_conserve_fkey"
            columns: ["patient_conserve"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_fusions_patient_fusionne_fkey"
            columns: ["patient_fusionne"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_fusions_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_habilitations: {
        Row: {
          accorde_par: string | null
          analyse_id: string
          created_at: string
          id: string
          structure_id: string
          user_id: string
          valide_jusqu: string | null
        }
        Insert: {
          accorde_par?: string | null
          analyse_id: string
          created_at?: string
          id?: string
          structure_id: string
          user_id: string
          valide_jusqu?: string | null
        }
        Update: {
          accorde_par?: string | null
          analyse_id?: string
          created_at?: string
          id?: string
          structure_id?: string
          user_id?: string
          valide_jusqu?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_habilitations_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "sante_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_habilitations_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_journal_exploitation: {
        Row: {
          acquitte_le: string | null
          acquitte_par: string | null
          created_at: string
          details: Json | null
          id: number
          message: string
          niveau: string
          source: string
          structure_id: string | null
        }
        Insert: {
          acquitte_le?: string | null
          acquitte_par?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          message: string
          niveau: string
          source: string
          structure_id?: string | null
        }
        Update: {
          acquitte_le?: string | null
          acquitte_par?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          message?: string
          niveau?: string
          source?: string
          structure_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_journal_exploitation_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_lots_reactifs: {
        Row: {
          id: string
          numero_lot: string
          peremption: string
          quantite_recue: number
          quantite_restante: number
          reactif_id: string
          recu_le: string
          recu_par: string | null
          structure_id: string
        }
        Insert: {
          id?: string
          numero_lot: string
          peremption: string
          quantite_recue: number
          quantite_restante: number
          reactif_id: string
          recu_le?: string
          recu_par?: string | null
          structure_id: string
        }
        Update: {
          id?: string
          numero_lot?: string
          peremption?: string
          quantite_recue?: number
          quantite_restante?: number
          reactif_id?: string
          recu_le?: string
          recu_par?: string | null
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_lots_reactifs_reactif_id_fkey"
            columns: ["reactif_id"]
            isOneToOne: false
            referencedRelation: "sante_reactifs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_lots_reactifs_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_micro_germes: {
        Row: {
          commentaire: string | null
          demande_id: string
          germe: string
          id: string
          quantification: string | null
          saisi_le: string
          saisi_par: string | null
          statut: string
          structure_id: string
          type_examen: string
        }
        Insert: {
          commentaire?: string | null
          demande_id: string
          germe: string
          id?: string
          quantification?: string | null
          saisi_le?: string
          saisi_par?: string | null
          statut?: string
          structure_id: string
          type_examen?: string
        }
        Update: {
          commentaire?: string | null
          demande_id?: string
          germe?: string
          id?: string
          quantification?: string | null
          saisi_le?: string
          saisi_par?: string | null
          statut?: string
          structure_id?: string
          type_examen?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_micro_germes_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_non_conformites: {
        Row: {
          action_corrective: string | null
          cloture_le: string | null
          cloture_par: string | null
          cree_le: string
          cree_par: string | null
          demande_id: string | null
          description: string
          gravite: string
          id: string
          statut: string
          structure_id: string
          type: string
        }
        Insert: {
          action_corrective?: string | null
          cloture_le?: string | null
          cloture_par?: string | null
          cree_le?: string
          cree_par?: string | null
          demande_id?: string | null
          description: string
          gravite?: string
          id?: string
          statut?: string
          structure_id: string
          type: string
        }
        Update: {
          action_corrective?: string | null
          cloture_le?: string | null
          cloture_par?: string | null
          cree_le?: string
          cree_par?: string | null
          demande_id?: string | null
          description?: string
          gravite?: string
          id?: string
          statut?: string
          structure_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_non_conformites_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_non_conformites_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_ordonnance_lignes: {
        Row: {
          dose_mg_jour: number | null
          duree: string | null
          id: string
          justification_allergie: string | null
          justification_pediatrie: string | null
          medicament: string
          ordonnance_id: string
          ordre: number
          posologie: string
          quantite: string | null
        }
        Insert: {
          dose_mg_jour?: number | null
          duree?: string | null
          id?: string
          justification_allergie?: string | null
          justification_pediatrie?: string | null
          medicament: string
          ordonnance_id: string
          ordre: number
          posologie: string
          quantite?: string | null
        }
        Update: {
          dose_mg_jour?: number | null
          duree?: string | null
          id?: string
          justification_allergie?: string | null
          justification_pediatrie?: string | null
          medicament?: string
          ordonnance_id?: string
          ordre?: number
          posologie?: string
          quantite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_ordonnance_lignes_ordonnance_id_fkey"
            columns: ["ordonnance_id"]
            isOneToOne: false
            referencedRelation: "sante_ordonnances"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_ordonnances: {
        Row: {
          consultation_id: string
          emise_le: string
          emise_par: string
          id: string
          numero: string
          patient_id: string
          praticien_id: string
          recommandations: string | null
          structure_id: string
        }
        Insert: {
          consultation_id: string
          emise_le?: string
          emise_par: string
          id?: string
          numero: string
          patient_id: string
          praticien_id: string
          recommandations?: string | null
          structure_id: string
        }
        Update: {
          consultation_id?: string
          emise_le?: string
          emise_par?: string
          id?: string
          numero?: string
          patient_id?: string
          praticien_id?: string
          recommandations?: string | null
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_ordonnances_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "sante_consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_ordonnances_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_ordonnances_praticien_id_fkey"
            columns: ["praticien_id"]
            isOneToOne: false
            referencedRelation: "sante_praticiens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_ordonnances_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_organismes: {
        Row: {
          actif: boolean
          bascule_patient_autorisee: boolean
          compte_auxiliaire: string | null
          created_at: string
          id: string
          nom: string
          structure_id: string
          type: string
        }
        Insert: {
          actif?: boolean
          bascule_patient_autorisee?: boolean
          compte_auxiliaire?: string | null
          created_at?: string
          id?: string
          nom: string
          structure_id: string
          type?: string
        }
        Update: {
          actif?: boolean
          bascule_patient_autorisee?: boolean
          compte_auxiliaire?: string | null
          created_at?: string
          id?: string
          nom?: string
          structure_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_organismes_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_patient_assurances: {
        Row: {
          ayant_droit: string | null
          created_at: string
          date_debut: string | null
          date_fin: string | null
          id: string
          numero_adherent: string | null
          organisme: string
          patient_id: string
          plafond: number | null
          taux_couverture: number | null
        }
        Insert: {
          ayant_droit?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          numero_adherent?: string | null
          organisme: string
          patient_id: string
          plafond?: number | null
          taux_couverture?: number | null
        }
        Update: {
          ayant_droit?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          numero_adherent?: string | null
          organisme?: string
          patient_id?: string
          plafond?: number | null
          taux_couverture?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_patient_assurances_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_patient_sequences: {
        Row: {
          annee: number
          dernier: number
          structure_id: string
        }
        Insert: {
          annee: number
          dernier?: number
          structure_id: string
        }
        Update: {
          annee?: number
          dernier?: number
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_patient_sequences_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_patients: {
        Row: {
          adresse: string | null
          contact_urgence_nom: string | null
          contact_urgence_tel: string | null
          created_at: string
          created_by: string | null
          date_naissance: string | null
          date_naissance_estimee: boolean
          email: string | null
          fusionne_dans: string | null
          id: string
          lieu_naissance: string | null
          nom: string
          numero_dossier: string
          prenoms: string
          profession: string | null
          sexe: string
          statut: string
          structure_id: string
          telephone: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          contact_urgence_nom?: string | null
          contact_urgence_tel?: string | null
          created_at?: string
          created_by?: string | null
          date_naissance?: string | null
          date_naissance_estimee?: boolean
          email?: string | null
          fusionne_dans?: string | null
          id?: string
          lieu_naissance?: string | null
          nom: string
          numero_dossier: string
          prenoms: string
          profession?: string | null
          sexe: string
          statut?: string
          structure_id: string
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          contact_urgence_nom?: string | null
          contact_urgence_tel?: string | null
          created_at?: string
          created_by?: string | null
          date_naissance?: string | null
          date_naissance_estimee?: boolean
          email?: string | null
          fusionne_dans?: string | null
          id?: string
          lieu_naissance?: string | null
          nom?: string
          numero_dossier?: string
          prenoms?: string
          profession?: string | null
          sexe?: string
          statut?: string
          structure_id?: string
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_patients_fusionne_dans_fkey"
            columns: ["fusionne_dans"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_patients_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_personnel_parametres: {
        Row: {
          forfait_astreinte: number
          forfait_garde: number
          structure_id: string
          updated_at: string
        }
        Insert: {
          forfait_astreinte?: number
          forfait_garde?: number
          structure_id: string
          updated_at?: string
        }
        Update: {
          forfait_astreinte?: number
          forfait_garde?: number
          structure_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_personnel_parametres_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: true
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_plannings: {
        Row: {
          created_at: string
          created_by: string | null
          debut: string
          employee_id: string | null
          fin: string
          id: string
          membership_id: string | null
          note: string | null
          site_id: string | null
          statut: string
          structure_id: string
          type: string
          valide_le: string | null
          valide_par: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          debut: string
          employee_id?: string | null
          fin: string
          id?: string
          membership_id?: string | null
          note?: string | null
          site_id?: string | null
          statut?: string
          structure_id: string
          type: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          debut?: string
          employee_id?: string | null
          fin?: string
          id?: string
          membership_id?: string | null
          note?: string | null
          site_id?: string | null
          statut?: string
          structure_id?: string
          type?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_plannings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_plannings_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "structure_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_plannings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_plannings_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_portail_patient: {
        Row: {
          created_at: string
          cree_par: string | null
          expire_le: string
          id: string
          patient_id: string
          secret_hash: string
          structure_id: string
          tentatives: number
          type: string
          utilise: boolean
        }
        Insert: {
          created_at?: string
          cree_par?: string | null
          expire_le: string
          id?: string
          patient_id: string
          secret_hash: string
          structure_id: string
          tentatives?: number
          type: string
          utilise?: boolean
        }
        Update: {
          created_at?: string
          cree_par?: string | null
          expire_le?: string
          id?: string
          patient_id?: string
          secret_hash?: string
          structure_id?: string
          tentatives?: number
          type?: string
          utilise?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sante_portail_patient_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_portail_patient_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_portail_patient_essais: {
        Row: {
          cle: string
          created_at: string
          id: string
        }
        Insert: {
          cle: string
          created_at?: string
          id?: string
        }
        Update: {
          cle?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      sante_praticiens: {
        Row: {
          actif: boolean
          created_at: string
          email: string | null
          id: string
          nom: string
          numero_ordre: string | null
          specialite: string | null
          structure_id: string
          taux_retenue_source: number
          user_id: string | null
        }
        Insert: {
          actif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nom: string
          numero_ordre?: string | null
          specialite?: string | null
          structure_id: string
          taux_retenue_source?: number
          user_id?: string | null
        }
        Update: {
          actif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nom?: string
          numero_ordre?: string | null
          specialite?: string | null
          structure_id?: string
          taux_retenue_source?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_praticiens_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_profils: {
        Row: {
          analyses: string[]
          code: string
          id: string
          libelle: string
          structure_id: string
        }
        Insert: {
          analyses: string[]
          code: string
          id?: string
          libelle: string
          structure_id: string
        }
        Update: {
          analyses?: string[]
          code?: string
          id?: string
          libelle?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_profils_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_rappels: {
        Row: {
          canal: string
          created_at: string
          envoye_le: string | null
          erreur: string | null
          fournisseur_id: string | null
          id: string
          rdv_id: string
          statut: string
          structure_id: string
        }
        Insert: {
          canal?: string
          created_at?: string
          envoye_le?: string | null
          erreur?: string | null
          fournisseur_id?: string | null
          id?: string
          rdv_id: string
          statut?: string
          structure_id: string
        }
        Update: {
          canal?: string
          created_at?: string
          envoye_le?: string | null
          erreur?: string | null
          fournisseur_id?: string | null
          id?: string
          rdv_id?: string
          statut?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_rappels_rdv_id_fkey"
            columns: ["rdv_id"]
            isOneToOne: false
            referencedRelation: "sante_rendez_vous"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_rappels_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_reactifs: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          nom: string
          seuil_alerte: number
          structure_id: string
          unite: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          nom: string
          seuil_alerte?: number
          structure_id: string
          unite?: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          nom?: string
          seuil_alerte?: number
          structure_id?: string
          unite?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_reactifs_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_rectificatifs: {
        Row: {
          ancien_drapeau: string | null
          ancienne_valeur_num: number | null
          ancienne_valeur_texte: string | null
          demande_id: string
          id: string
          le: string
          motif: string
          nouvelle_valeur_num: number | null
          nouvelle_valeur_texte: string | null
          par: string
          parametre_id: string
          structure_id: string
          traitement_deja_prescrit: boolean
          version: number
        }
        Insert: {
          ancien_drapeau?: string | null
          ancienne_valeur_num?: number | null
          ancienne_valeur_texte?: string | null
          demande_id: string
          id?: string
          le?: string
          motif: string
          nouvelle_valeur_num?: number | null
          nouvelle_valeur_texte?: string | null
          par: string
          parametre_id: string
          structure_id: string
          traitement_deja_prescrit?: boolean
          version: number
        }
        Update: {
          ancien_drapeau?: string | null
          ancienne_valeur_num?: number | null
          ancienne_valeur_texte?: string | null
          demande_id?: string
          id?: string
          le?: string
          motif?: string
          nouvelle_valeur_num?: number | null
          nouvelle_valeur_texte?: string | null
          par?: string
          parametre_id?: string
          structure_id?: string
          traitement_deja_prescrit?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_rectificatifs_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_rectificatifs_parametre_id_fkey"
            columns: ["parametre_id"]
            isOneToOne: false
            referencedRelation: "sante_analyse_parametres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_rectificatifs_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_reglement_imputations: {
        Row: {
          facture_id: string
          id: string
          montant: number
          reglement_id: string
          structure_id: string
        }
        Insert: {
          facture_id: string
          id?: string
          montant: number
          reglement_id: string
          structure_id: string
        }
        Update: {
          facture_id?: string
          id?: string
          montant?: number
          reglement_id?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_reglement_imputations_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_reglement_imputations_reglement_id_fkey"
            columns: ["reglement_id"]
            isOneToOne: false
            referencedRelation: "sante_reglements_organisme"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_reglements_organisme: {
        Row: {
          created_at: string
          created_by: string | null
          date_reglement: string
          id: string
          mode: string
          montant: number
          organisme: string
          reference: string | null
          structure_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_reglement?: string
          id?: string
          mode: string
          montant: number
          organisme: string
          reference?: string | null
          structure_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_reglement?: string
          id?: string
          mode?: string
          montant?: number
          organisme?: string
          reference?: string | null
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_reglements_organisme_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_relances: {
        Row: {
          created_at: string
          created_by: string | null
          factures: string[]
          id: string
          montant: number
          niveau: number
          organisme: string
          structure_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          factures: string[]
          id?: string
          montant: number
          niveau: number
          organisme: string
          structure_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          factures?: string[]
          id?: string
          montant?: number
          niveau?: number
          organisme?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_relances_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_remboursements: {
        Row: {
          approuve_le: string | null
          approuve_par: string | null
          avoir_id: string
          created_at: string
          demande_par: string | null
          facture_id: string
          id: string
          mode: string | null
          montant: number
          motif: string
          motif_decision: string | null
          paye_le: string | null
          paye_par: string | null
          session_id: string | null
          statut: string
          structure_id: string
        }
        Insert: {
          approuve_le?: string | null
          approuve_par?: string | null
          avoir_id: string
          created_at?: string
          demande_par?: string | null
          facture_id: string
          id?: string
          mode?: string | null
          montant: number
          motif: string
          motif_decision?: string | null
          paye_le?: string | null
          paye_par?: string | null
          session_id?: string | null
          statut?: string
          structure_id: string
        }
        Update: {
          approuve_le?: string | null
          approuve_par?: string | null
          avoir_id?: string
          created_at?: string
          demande_par?: string | null
          facture_id?: string
          id?: string
          mode?: string | null
          montant?: number
          motif?: string
          motif_decision?: string | null
          paye_le?: string | null
          paye_par?: string | null
          session_id?: string | null
          statut?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_remboursements_avoir_id_fkey"
            columns: ["avoir_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_remboursements_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_remboursements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sante_sessions_caisse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_remboursements_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_remise_cheque_lignes: {
        Row: {
          encaissement_id: string
          remise_id: string
          structure_id: string
        }
        Insert: {
          encaissement_id: string
          remise_id: string
          structure_id: string
        }
        Update: {
          encaissement_id?: string
          remise_id?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_remise_cheque_lignes_encaissement_id_fkey"
            columns: ["encaissement_id"]
            isOneToOne: true
            referencedRelation: "sante_encaissements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_remise_cheque_lignes_remise_id_fkey"
            columns: ["remise_id"]
            isOneToOne: false
            referencedRelation: "sante_remises_cheques"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_remises_cheques: {
        Row: {
          created_at: string
          created_by: string | null
          date_remise: string
          id: string
          montant: number
          structure_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_remise?: string
          id?: string
          montant: number
          structure_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_remise?: string
          id?: string
          montant?: number
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_remises_cheques_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_remises_resultats: {
        Row: {
          beneficiaire: string
          created_at: string
          demande_id: string
          id: string
          nom_mandataire: string | null
          patient_id: string
          piece_numero: string
          piece_type: string
          procuration: boolean
          remis_par: string
          structure_id: string
        }
        Insert: {
          beneficiaire: string
          created_at?: string
          demande_id: string
          id?: string
          nom_mandataire?: string | null
          patient_id: string
          piece_numero: string
          piece_type: string
          procuration?: boolean
          remis_par?: string
          structure_id: string
        }
        Update: {
          beneficiaire?: string
          created_at?: string
          demande_id?: string
          id?: string
          nom_mandataire?: string | null
          patient_id?: string
          piece_numero?: string
          piece_type?: string
          procuration?: boolean
          remis_par?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_remises_resultats_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_remises_resultats_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_rendez_vous: {
        Row: {
          arrive_le: string | null
          created_at: string
          created_by: string | null
          debut: string
          duree_min: number
          id: string
          motif: string | null
          patient_id: string
          praticien_id: string
          site_id: string | null
          statut: string
          structure_id: string
          updated_at: string
        }
        Insert: {
          arrive_le?: string | null
          created_at?: string
          created_by?: string | null
          debut: string
          duree_min?: number
          id?: string
          motif?: string | null
          patient_id: string
          praticien_id: string
          site_id?: string | null
          statut?: string
          structure_id: string
          updated_at?: string
        }
        Update: {
          arrive_le?: string | null
          created_at?: string
          created_by?: string | null
          debut?: string
          duree_min?: number
          id?: string
          motif?: string | null
          patient_id?: string
          praticien_id?: string
          site_id?: string | null
          statut?: string
          structure_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_rendez_vous_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "sante_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_rendez_vous_praticien_id_fkey"
            columns: ["praticien_id"]
            isOneToOne: false
            referencedRelation: "sante_praticiens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_rendez_vous_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_rendez_vous_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_resultats: {
        Row: {
          a_refaire: boolean
          critique_acquitte_le: string | null
          critique_acquitte_par: string | null
          demande_id: string
          drapeau: string
          id: string
          libelle_fige: string | null
          lot_id: string | null
          methode_fige: string | null
          motif_refaire: string | null
          parametre_id: string
          ref_bas: number | null
          ref_haut: number | null
          saisi_le: string
          saisi_par: string
          structure_id: string
          unite_fige: string | null
          valeur_num: number | null
          valeur_texte: string | null
        }
        Insert: {
          a_refaire?: boolean
          critique_acquitte_le?: string | null
          critique_acquitte_par?: string | null
          demande_id: string
          drapeau?: string
          id?: string
          libelle_fige?: string | null
          lot_id?: string | null
          methode_fige?: string | null
          motif_refaire?: string | null
          parametre_id: string
          ref_bas?: number | null
          ref_haut?: number | null
          saisi_le?: string
          saisi_par: string
          structure_id: string
          unite_fige?: string | null
          valeur_num?: number | null
          valeur_texte?: string | null
        }
        Update: {
          a_refaire?: boolean
          critique_acquitte_le?: string | null
          critique_acquitte_par?: string | null
          demande_id?: string
          drapeau?: string
          id?: string
          libelle_fige?: string | null
          lot_id?: string | null
          methode_fige?: string | null
          motif_refaire?: string | null
          parametre_id?: string
          ref_bas?: number | null
          ref_haut?: number | null
          saisi_le?: string
          saisi_par?: string
          structure_id?: string
          unite_fige?: string | null
          valeur_num?: number | null
          valeur_texte?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_resultats_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_resultats_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "sante_lots_reactifs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_resultats_parametre_id_fkey"
            columns: ["parametre_id"]
            isOneToOne: false
            referencedRelation: "sante_analyse_parametres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_resultats_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_resultats_historique: {
        Row: {
          demande_id: string
          drapeau: string | null
          id: string
          motif: string | null
          parametre_id: string
          remplace_le: string
          resultat_id: string
          saisi_le: string | null
          saisi_par: string | null
          structure_id: string
          valeur_num: number | null
          valeur_texte: string | null
        }
        Insert: {
          demande_id: string
          drapeau?: string | null
          id?: string
          motif?: string | null
          parametre_id: string
          remplace_le?: string
          resultat_id: string
          saisi_le?: string | null
          saisi_par?: string | null
          structure_id: string
          valeur_num?: number | null
          valeur_texte?: string | null
        }
        Update: {
          demande_id?: string
          drapeau?: string | null
          id?: string
          motif?: string | null
          parametre_id?: string
          remplace_le?: string
          resultat_id?: string
          saisi_le?: string | null
          saisi_par?: string | null
          structure_id?: string
          valeur_num?: number | null
          valeur_texte?: string | null
        }
        Relationships: []
      }
      sante_retrocession_regles: {
        Row: {
          actif: boolean
          categorie: string
          created_at: string
          created_by: string | null
          id: string
          praticien_id: string
          structure_id: string
          taux: number
        }
        Insert: {
          actif?: boolean
          categorie: string
          created_at?: string
          created_by?: string | null
          id?: string
          praticien_id: string
          structure_id: string
          taux: number
        }
        Update: {
          actif?: boolean
          categorie?: string
          created_at?: string
          created_by?: string | null
          id?: string
          praticien_id?: string
          structure_id?: string
          taux?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_retrocession_regles_praticien_id_fkey"
            columns: ["praticien_id"]
            isOneToOne: false
            referencedRelation: "sante_praticiens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_retrocession_regles_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_retrocessions: {
        Row: {
          annule_le: string | null
          annule_par: string | null
          base: number
          details: Json
          id: string
          mode_paiement: string | null
          montant_brut: number
          montant_net: number
          motif_annulation: string | null
          numero: string
          paye_le: string | null
          paye_par: string | null
          periode_debut: string
          periode_fin: string
          praticien_id: string
          reference_paiement: string | null
          retenue: number
          statut: string
          structure_id: string
          valide_le: string
          valide_par: string | null
        }
        Insert: {
          annule_le?: string | null
          annule_par?: string | null
          base?: number
          details?: Json
          id?: string
          mode_paiement?: string | null
          montant_brut?: number
          montant_net?: number
          motif_annulation?: string | null
          numero: string
          paye_le?: string | null
          paye_par?: string | null
          periode_debut: string
          periode_fin: string
          praticien_id: string
          reference_paiement?: string | null
          retenue?: number
          statut?: string
          structure_id: string
          valide_le?: string
          valide_par?: string | null
        }
        Update: {
          annule_le?: string | null
          annule_par?: string | null
          base?: number
          details?: Json
          id?: string
          mode_paiement?: string | null
          montant_brut?: number
          montant_net?: number
          motif_annulation?: string | null
          numero?: string
          paye_le?: string | null
          paye_par?: string | null
          periode_debut?: string
          periode_fin?: string
          praticien_id?: string
          reference_paiement?: string | null
          retenue?: number
          statut?: string
          structure_id?: string
          valide_le?: string
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sante_retrocessions_praticien_id_fkey"
            columns: ["praticien_id"]
            isOneToOne: false
            referencedRelation: "sante_praticiens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_retrocessions_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_sequences: {
        Row: {
          annee: number
          dernier: number
          structure_id: string
          type: string
        }
        Insert: {
          annee: number
          dernier?: number
          structure_id: string
          type: string
        }
        Update: {
          annee?: number
          dernier?: number
          structure_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_sequences_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_sessions_caisse: {
        Row: {
          caissier: string
          ecart: number | null
          fermee_le: string | null
          fond_initial: number
          id: string
          montant_attendu: number | null
          montant_compte: number | null
          ouverte_le: string
          structure_id: string
        }
        Insert: {
          caissier?: string
          ecart?: number | null
          fermee_le?: string | null
          fond_initial?: number
          id?: string
          montant_attendu?: number | null
          montant_compte?: number | null
          ouverte_le?: string
          structure_id: string
        }
        Update: {
          caissier?: string
          ecart?: number | null
          fermee_le?: string | null
          fond_initial?: number
          id?: string
          montant_attendu?: number | null
          montant_compte?: number | null
          ouverte_le?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_sessions_caisse_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_sous_traitance: {
        Row: {
          analyse_id: string
          demande_id: string
          envoye_le: string
          envoye_par: string | null
          id: string
          laboratoire: string
          recu_le: string | null
          recu_par: string | null
          reference_externe: string | null
          statut: string
          structure_id: string
        }
        Insert: {
          analyse_id: string
          demande_id: string
          envoye_le?: string
          envoye_par?: string | null
          id?: string
          laboratoire: string
          recu_le?: string | null
          recu_par?: string | null
          reference_externe?: string | null
          statut?: string
          structure_id: string
        }
        Update: {
          analyse_id?: string
          demande_id?: string
          envoye_le?: string
          envoye_par?: string | null
          id?: string
          laboratoire?: string
          recu_le?: string | null
          recu_par?: string | null
          reference_externe?: string | null
          statut?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_sous_traitance_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "sante_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_sous_traitance_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "sante_demandes_labo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_sous_traitance_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_tarifs_convention: {
        Row: {
          code: string
          id: string
          organisme: string
          structure_id: string
          tarif: number
        }
        Insert: {
          code: string
          id?: string
          organisme: string
          structure_id: string
          tarif: number
        }
        Update: {
          code?: string
          id?: string
          organisme?: string
          structure_id?: string
          tarif?: number
        }
        Relationships: [
          {
            foreignKeyName: "sante_tarifs_convention_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_tiers_rejets: {
        Row: {
          avoir_id: string | null
          created_at: string
          created_by: string | null
          facture_bascule_id: string | null
          facture_id: string
          id: string
          montant: number
          motif: string
          structure_id: string
          type: string
        }
        Insert: {
          avoir_id?: string | null
          created_at?: string
          created_by?: string | null
          facture_bascule_id?: string | null
          facture_id: string
          id?: string
          montant?: number
          motif: string
          structure_id: string
          type: string
        }
        Update: {
          avoir_id?: string | null
          created_at?: string
          created_by?: string | null
          facture_bascule_id?: string | null
          facture_id?: string
          id?: string
          montant?: number
          motif?: string
          structure_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_tiers_rejets_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "sante_factures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_valeurs_reference: {
        Row: {
          age_max_jours: number
          age_min_jours: number
          bas: number | null
          critique_bas: number | null
          critique_haut: number | null
          grossesse: boolean | null
          haut: number | null
          id: string
          methode: string | null
          parametre_id: string
          sexe: string | null
          structure_id: string
        }
        Insert: {
          age_max_jours?: number
          age_min_jours?: number
          bas?: number | null
          critique_bas?: number | null
          critique_haut?: number | null
          grossesse?: boolean | null
          haut?: number | null
          id?: string
          methode?: string | null
          parametre_id: string
          sexe?: string | null
          structure_id: string
        }
        Update: {
          age_max_jours?: number
          age_min_jours?: number
          bas?: number | null
          critique_bas?: number | null
          critique_haut?: number | null
          grossesse?: boolean | null
          haut?: number | null
          id?: string
          methode?: string | null
          parametre_id?: string
          sexe?: string | null
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_valeurs_reference_parametre_id_fkey"
            columns: ["parametre_id"]
            isOneToOne: false
            referencedRelation: "sante_analyse_parametres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sante_valeurs_reference_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
            referencedColumns: ["id"]
          },
        ]
      }
      sante_violations: {
        Row: {
          cloturee_le: string | null
          conclusion: string | null
          created_at: string
          declare_par: string
          detectee_le: string
          donnees_concernees: string
          echeance_notification: string | null
          gravite: string | null
          id: string
          mesures: string | null
          nature: string
          nb_personnes: number | null
          notifiee_cdp_le: string | null
          personnes_informees_le: string | null
          qualification: string | null
          qualifiee_le: string | null
          statut: string
          structure_id: string
        }
        Insert: {
          cloturee_le?: string | null
          conclusion?: string | null
          created_at?: string
          declare_par?: string
          detectee_le?: string
          donnees_concernees: string
          echeance_notification?: string | null
          gravite?: string | null
          id?: string
          mesures?: string | null
          nature: string
          nb_personnes?: number | null
          notifiee_cdp_le?: string | null
          personnes_informees_le?: string | null
          qualification?: string | null
          qualifiee_le?: string | null
          statut?: string
          structure_id: string
        }
        Update: {
          cloturee_le?: string | null
          conclusion?: string | null
          created_at?: string
          declare_par?: string
          detectee_le?: string
          donnees_concernees?: string
          echeance_notification?: string | null
          gravite?: string | null
          id?: string
          mesures?: string | null
          nature?: string
          nb_personnes?: number | null
          notifiee_cdp_le?: string | null
          personnes_informees_le?: string | null
          qualification?: string | null
          qualifiee_le?: string | null
          statut?: string
          structure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sante_violations_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "structures"
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
          acces_tous_dossiers: boolean
          acte_consultation_code: string | null
          adresse: string | null
          autorisation_exercice: string | null
          bris_glace_renouvellements_max: number
          bris_glace_seuil_semaine: number
          compta_panne_simulee: boolean
          conservation_echantillons_jours: number
          cr_conditionne_reglement: boolean
          created_at: string
          created_by: string
          derogation_validation_unique: boolean
          devise: string
          entreprise_id: string | null
          facturation_auto: boolean
          facturation_labo_moment: string
          habilitations_obligatoires: boolean
          id: string
          inscription_ordre: string | null
          logo_path: string | null
          ninea: string | null
          nom: string
          prorata_tva: number
          rappels_sms_actifs: boolean
          rccm: string | null
          regime_tva: string
          sms_expediteur: string | null
          telephone: string | null
          theme_medical: Database["public"]["Enums"]["medical_theme"]
          type: Database["public"]["Enums"]["structure_type"]
          updated_at: string
        }
        Insert: {
          acces_tous_dossiers?: boolean
          acte_consultation_code?: string | null
          adresse?: string | null
          autorisation_exercice?: string | null
          bris_glace_renouvellements_max?: number
          bris_glace_seuil_semaine?: number
          compta_panne_simulee?: boolean
          conservation_echantillons_jours?: number
          cr_conditionne_reglement?: boolean
          created_at?: string
          created_by: string
          derogation_validation_unique?: boolean
          devise?: string
          entreprise_id?: string | null
          facturation_auto?: boolean
          facturation_labo_moment?: string
          habilitations_obligatoires?: boolean
          id?: string
          inscription_ordre?: string | null
          logo_path?: string | null
          ninea?: string | null
          nom: string
          prorata_tva?: number
          rappels_sms_actifs?: boolean
          rccm?: string | null
          regime_tva?: string
          sms_expediteur?: string | null
          telephone?: string | null
          theme_medical?: Database["public"]["Enums"]["medical_theme"]
          type: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Update: {
          acces_tous_dossiers?: boolean
          acte_consultation_code?: string | null
          adresse?: string | null
          autorisation_exercice?: string | null
          bris_glace_renouvellements_max?: number
          bris_glace_seuil_semaine?: number
          compta_panne_simulee?: boolean
          conservation_echantillons_jours?: number
          cr_conditionne_reglement?: boolean
          created_at?: string
          created_by?: string
          derogation_validation_unique?: boolean
          devise?: string
          entreprise_id?: string | null
          facturation_auto?: boolean
          facturation_labo_moment?: string
          habilitations_obligatoires?: boolean
          id?: string
          inscription_ordre?: string | null
          logo_path?: string | null
          ninea?: string | null
          nom?: string
          prorata_tva?: number
          rappels_sms_actifs?: boolean
          rccm?: string | null
          regime_tva?: string
          sms_expediteur?: string | null
          telephone?: string | null
          theme_medical?: Database["public"]["Enums"]["medical_theme"]
          type?: Database["public"]["Enums"]["structure_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "structures_entreprise_id_fkey"
            columns: ["entreprise_id"]
            isOneToOne: false
            referencedRelation: "entreprises"
            referencedColumns: ["id"]
          },
        ]
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
      banque_importer: {
        Args: {
          _compte: string
          _empreinte: string
          _entreprise_id: string
          _exercice_id: string
          _nom_fichier: string
          _operations: Json
          _solde_initial: number
        }
        Returns: string
      }
      banque_peut_ecrire: { Args: { _entreprise_id: string }; Returns: boolean }
      banque_rapprocher: {
        Args: { _journal_id: string; _operation_id: string }
        Returns: undefined
      }
      can_access_clinique: { Args: { _patient_id: string }; Returns: boolean }
      can_access_patient: { Args: { _patient_id: string }; Returns: boolean }
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
      fn_cloturer_exercice: {
        Args: { _exercice_id: string }
        Returns: undefined
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
      has_any_medical_role: {
        Args: { _roles: string[]; _structure_id: string }
        Returns: boolean
      }
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
      lier_structure_entreprise: {
        Args: { _entreprise_id: string; _structure_id: string }
        Returns: undefined
      }
      mfa_conforme: { Args: never; Returns: boolean }
      module_actif: {
        Args: { _entreprise_id: string; _module: string }
        Returns: boolean
      }
      sante_acquitter_critique: {
        Args: { _resultat_id: string }
        Returns: undefined
      }
      sante_acquitter_journal: { Args: { _ids: number[] }; Returns: number }
      sante_alertes_stock: { Args: { _structure_id: string }; Returns: Json }
      sante_annuler_facture: {
        Args: { _facture_id: string; _motif: string }
        Returns: string
      }
      sante_annuler_facture_interne: {
        Args: { _facture_id: string; _motif: string }
        Returns: string
      }
      sante_annuler_fusion: {
        Args: { _fusion_id: string; _motif: string }
        Returns: undefined
      }
      sante_annuler_retrocession: {
        Args: { _id: string; _motif: string }
        Returns: undefined
      }
      sante_articles_disponibles: {
        Args: { _structure_id: string }
        Returns: {
          code: string
          designation: string
          id: string
          quantite_stock: number
          stock_minimum: number
          unite: string
        }[]
      }
      sante_assurance_active: { Args: { _patient_id: string }; Returns: string }
      sante_aux_organisme: {
        Args: { _nom: string; _structure_id: string }
        Returns: string
      }
      sante_avancer_demande: {
        Args: { _demande_id: string; _motif?: string; _statut: string }
        Returns: undefined
      }
      sante_avancer_violation: {
        Args: { _gravite: string; _id: string; _statut: string; _texte: string }
        Returns: undefined
      }
      sante_bris_de_glace:
        | { Args: { _motif: string; _patient_id: string }; Returns: string }
        | {
            Args: { _motif: string; _motif_code: string; _patient_id: string }
            Returns: string
          }
      sante_ca_analytique: {
        Args: {
          _axe: string
          _debut: string
          _fin: string
          _structure_id: string
        }
        Returns: {
          axe: string
          montant: number
          nb: number
        }[]
      }
      sante_calcul_retrocession: {
        Args: { _debut: string; _fin: string; _praticien_id: string }
        Returns: Json
      }
      sante_categorie_code: {
        Args: { _code: string; _structure_id: string }
        Returns: string
      }
      sante_cloturer_consultation: {
        Args: { _consultation_id: string }
        Returns: undefined
      }
      sante_coef_tva_deductible: {
        Args: { _entreprise_id: string }
        Returns: number
      }
      sante_comptabiliser: {
        Args: {
          _date: string
          _journal: string
          _libelle: string
          _lignes: Json
          _piece: string
          _source: string
          _structure_id: string
          _type: string
        }
        Returns: undefined
      }
      sante_compte: {
        Args: { _cle: string; _structure_id: string }
        Returns: string
      }
      sante_compte_defaut: { Args: { _cle: string }; Returns: string }
      sante_compte_tresorerie: {
        Args: { _mode: string; _structure_id: string }
        Returns: string
      }
      sante_config_acces: {
        Args: {
          _renouv: number
          _seuil: number
          _structure_id: string
          _tous: boolean
        }
        Returns: undefined
      }
      sante_config_conservation: {
        Args: { _annees: number; _structure_id: string; _type: string }
        Returns: undefined
      }
      sante_config_facturation: {
        Args: { _acte_code: string; _auto: boolean; _structure_id: string }
        Returns: undefined
      }
      sante_config_fiscal: {
        Args: {
          _cr_conditionne: boolean
          _prorata: number
          _regime: string
          _structure_id: string
        }
        Returns: undefined
      }
      sante_config_labo_moment: {
        Args: { _moment: string; _structure_id: string }
        Returns: undefined
      }
      sante_config_rappels: {
        Args: { _actifs: boolean; _expediteur: string; _structure_id: string }
        Returns: undefined
      }
      sante_confirmer_fusion: {
        Args: { _fusion_id: string }
        Returns: undefined
      }
      sante_controle_quotidien: { Args: never; Returns: number }
      sante_cq_bloquant: { Args: { _demande_id: string }; Returns: boolean }
      sante_cr_remettable: { Args: { _demande_id: string }; Returns: boolean }
      sante_creances_organismes: {
        Args: { _structure_id: string }
        Returns: {
          derniere_relance: string
          j0_30: number
          j31_60: number
          j61_90: number
          nb: number
          niveau: number
          organisme: string
          plus_90: number
          total: number
        }[]
      }
      sante_creer_demande_labo: {
        Args: {
          _analyses: string[]
          _consultation_id?: string
          _patient_id: string
          _prescripteur?: string
          _renseignements?: string
          _urgence?: boolean
        }
        Returns: string
      }
      sante_creer_facture: {
        Args: {
          _assurance_id?: string
          _consultation_id?: string
          _demande_id?: string
          _lignes: Json
          _motif_remise?: string
          _patient_id: string
          _remise?: number
        }
        Returns: string
      }
      sante_creer_facture_interne: {
        Args: {
          _assurance_id: string
          _consultation_id: string
          _demande_id: string
          _lignes: Json
          _motif_remise: string
          _patient_id: string
          _remise: number
        }
        Returns: string
      }
      sante_creer_patient: {
        Args: {
          _adresse?: string
          _consentement?: boolean
          _contact_urgence_nom?: string
          _contact_urgence_tel?: string
          _date_naissance?: string
          _date_naissance_estimee?: boolean
          _ignorer_doublons?: boolean
          _nom: string
          _prenoms: string
          _sexe: string
          _structure_id: string
          _telephone?: string
        }
        Returns: string
      }
      sante_creer_structure: {
        Args: {
          _adresse?: string
          _autorisation_exercice?: string
          _ninea?: string
          _nom: string
          _role_metier?: Database["public"]["Enums"]["medical_role"]
          _telephone?: string
          _theme?: Database["public"]["Enums"]["medical_theme"]
          _type: Database["public"]["Enums"]["structure_type"]
        }
        Returns: string
      }
      sante_decider_remboursement: {
        Args: { _approuver: boolean; _id: string; _motif: string }
        Returns: undefined
      }
      sante_declarer_non_conformite: {
        Args: {
          _demande_id: string
          _description: string
          _gravite: string
          _structure_id: string
          _type: string
        }
        Returns: string
      }
      sante_definir_compte: {
        Args: { _cle: string; _compte: string; _structure_id: string }
        Returns: undefined
      }
      sante_demarrer_consultation: {
        Args: {
          _motif?: string
          _patient_id: string
          _praticien_id: string
          _rdv_id?: string
        }
        Returns: string
      }
      sante_dispenser: {
        Args: { _consultation_id: string; _lignes: Json }
        Returns: number
      }
      sante_doublons_patient: {
        Args: {
          _date_naissance: string
          _nom: string
          _prenoms: string
          _structure_id: string
          _telephone: string
        }
        Returns: {
          date_naissance: string
          id: string
          nom: string
          numero_dossier: string
          prenoms: string
          telephone: string
        }[]
      }
      sante_duree_conservation: {
        Args: { _structure_id: string; _type: string }
        Returns: number
      }
      sante_eliminer_echantillons: {
        Args: { _structure_id: string }
        Returns: number
      }
      sante_emettre_certificat: {
        Args: {
          _consultation_id: string
          _contenu: string
          _jours?: number
          _type: string
        }
        Returns: string
      }
      sante_emettre_ordonnance: {
        Args: {
          _consultation_id: string
          _lignes: Json
          _recommandations?: string
        }
        Returns: string
      }
      sante_encaisser: {
        Args: {
          _facture_id: string
          _mode: string
          _montant: number
          _reference?: string
        }
        Returns: string
      }
      sante_envoyer_sous_traitance: {
        Args: {
          _analyse_id: string
          _demande_id: string
          _laboratoire: string
          _reference: string
        }
        Returns: string
      }
      sante_escalader_bris_glace: { Args: never; Returns: number }
      sante_export_dossier: { Args: { _patient_id: string }; Returns: Json }
      sante_export_structure: { Args: { _structure_id: string }; Returns: Json }
      sante_fermer_caisse: {
        Args: { _compte: number; _session_id: string }
        Returns: number
      }
      sante_fusionner_patients: {
        Args: { _conserve: string; _fusionne: string; _motif: string }
        Returns: undefined
      }
      sante_germe_definitif: { Args: { _germe_id: string }; Returns: undefined }
      sante_imputer_reglement: {
        Args: {
          _imputations: Json
          _mode: string
          _montant: number
          _organisme: string
          _reference: string
          _structure_id: string
        }
        Returns: string
      }
      sante_indicateurs_exploitation: {
        Args: { _structure_id: string }
        Returns: Json
      }
      sante_journaliser: {
        Args: {
          _details?: Json
          _message: string
          _niveau: string
          _source: string
          _structure_id: string
        }
        Returns: undefined
      }
      sante_lettrer_facture: { Args: { _facture_id: string }; Returns: number }
      sante_lignes_compta_facture: {
        Args: { _facture_id: string }
        Returns: Json
      }
      sante_mouvement_reactif: {
        Args: {
          _lot_id?: string
          _numero_lot?: string
          _peremption?: string
          _quantite: number
          _reactif_id: string
          _type: string
        }
        Returns: undefined
      }
      sante_outbox_resume: { Args: { _structure_id: string }; Returns: Json }
      sante_ouvrir_caisse: {
        Args: { _fond: number; _structure_id: string }
        Returns: string
      }
      sante_ouvrir_dossier: {
        Args: { _ecran?: string; _patient_id: string }
        Returns: undefined
      }
      sante_payer_remboursement: {
        Args: { _id: string; _mode: string }
        Returns: undefined
      }
      sante_payer_retrocession: {
        Args: { _id: string; _mode: string; _reference?: string }
        Returns: undefined
      }
      sante_personnel_liste: {
        Args: { _structure_id: string }
        Returns: {
          employee_id: string
          fonction: string
          membership_id: string
          nom: string
        }[]
      }
      sante_prelever: {
        Args: {
          _conditions: Json
          _demande_id: string
          _identifiants: string[]
          _site: string
        }
        Returns: undefined
      }
      sante_primes_gardes_paie: {
        Args: { _annee: number; _entreprise_id: string; _mois: number }
        Returns: {
          astreintes: number
          employee_id: string
          gardes: number
          montant: number
        }[]
      }
      sante_prochain_numero: {
        Args: { _prefixe: string; _structure_id: string; _type: string }
        Returns: string
      }
      sante_proposer_fusion: {
        Args: { _conserve: string; _fusionne: string; _motif: string }
        Returns: string
      }
      sante_provisionner_creance: {
        Args: {
          _montant: number
          _motif: string
          _organisme: string
          _structure_id: string
        }
        Returns: string
      }
      sante_purger_documents_echus: {
        Args: { _structure_id: string }
        Returns: number
      }
      sante_rapport_caisse: { Args: { _session_id: string }; Returns: Json }
      sante_recap_personnel: {
        Args: { _annee: number; _mois: number; _structure_id: string }
        Returns: Json
      }
      sante_recevoir_sous_traitance: {
        Args: { _id: string; _reference: string }
        Returns: undefined
      }
      sante_rechercher_patients: {
        Args: {
          _limit?: number
          _offset?: number
          _q?: string
          _structure_id: string
        }
        Returns: {
          date_naissance: string
          id: string
          nom: string
          numero_dossier: string
          prenoms: string
          sexe: string
          telephone: string
          total: number
        }[]
      }
      sante_rectifier_resultat: {
        Args: {
          _demande_id: string
          _motif: string
          _parametre_id: string
          _valeur_num: number
          _valeur_texte: string
        }
        Returns: number
      }
      sante_rectifier_resultat_v2: {
        Args: {
          _demande_id: string
          _motif: string
          _parametre_id: string
          _traitement_deja_prescrit: boolean
          _valeur_num: number
          _valeur_texte: string
        }
        Returns: number
      }
      sante_refaire_resultat: {
        Args: { _demande_id: string; _motif: string; _parametre_id: string }
        Returns: undefined
      }
      sante_rejet_tiers: {
        Args: {
          _facture_id: string
          _montant: number
          _motif: string
          _type: string
        }
        Returns: string
      }
      sante_rejeter_echantillon: {
        Args: {
          _code: string
          _commentaire: string
          _demande_id: string
          _nouveau_prelevement: boolean
        }
        Returns: string
      }
      sante_rejouer_outbox: { Args: { _structure_id: string }; Returns: number }
      sante_rejouer_outbox_auto: { Args: never; Returns: number }
      sante_relancer: {
        Args: { _organisme: string; _structure_id: string }
        Returns: string
      }
      sante_relation_soin: { Args: { _patient_id: string }; Returns: boolean }
      sante_remettre_cheques: {
        Args: { _structure_id: string }
        Returns: string
      }
      sante_remise_possible: {
        Args: {
          _demande_id: string
          _patient_id: string
          _structure_id: string
        }
        Returns: boolean
      }
      sante_reserver_bloc: {
        Args: { _poste: string; _structure_id: string; _taille: number }
        Returns: string
      }
      sante_reste_organisme: { Args: { _facture_id: string }; Returns: number }
      sante_revoir_bris_glace:
        | { Args: { _id: string }; Returns: undefined }
        | { Args: { _commentaire: string; _id: string }; Returns: undefined }
      sante_saisir_cq: {
        Args: { _controle_id: string; _valeur: number }
        Returns: string
      }
      sante_saisir_eeq: {
        Args: {
          _analyse: string
          _campagne: string
          _cible: number
          _date: string
          _ecart: number
          _obtenue: number
          _organisme: string
          _structure_id: string
        }
        Returns: string
      }
      sante_saisir_facture_secours: {
        Args: {
          _assurance_id: string
          _bloc_id: string
          _lignes: Json
          _patient_id: string
          _rang: number
        }
        Returns: string
      }
      sante_saisir_germe: {
        Args: {
          _antibiogramme: Json
          _commentaire: string
          _definitif: boolean
          _demande_id: string
          _germe: string
          _quantification: string
          _type: string
        }
        Returns: string
      }
      sante_saisir_resultat: {
        Args: {
          _demande_id: string
          _parametre_id: string
          _valeur_num: number
          _valeur_texte?: string
        }
        Returns: string
      }
      sante_saisir_resultat_v2: {
        Args: {
          _demande_id: string
          _lot_id: string
          _parametre_id: string
          _valeur_num: number
          _valeur_texte: string
        }
        Returns: string
      }
      sante_signer_consentement: {
        Args: {
          _accorde: boolean
          _patient_id: string
          _signataire_nom: string
          _signataire_qualite: string
          _signature_png: string
          _texte: string
          _type: string
          _version: string
        }
        Returns: string
      }
      sante_statut_tiers: {
        Args: { _facture_id: string; _statut: string }
        Returns: undefined
      }
      sante_storage_patient: { Args: { _name: string }; Returns: string }
      sante_supervision: { Args: { _structure_id: string }; Returns: Json }
      sante_tableau_bord: {
        Args: { _debut: string; _fin: string; _structure_id: string }
        Returns: Json
      }
      sante_traiter_evenement: { Args: { _id: string }; Returns: string }
      sante_traiter_non_conformite: {
        Args: { _action: string; _cloturer: boolean; _id: string }
        Returns: undefined
      }
      sante_valider_creneaux: { Args: { _ids: string[] }; Returns: number }
      sante_valider_demande: {
        Args: { _demande_id: string; _niveau: string }
        Returns: undefined
      }
      sante_valider_retrocession: {
        Args: { _debut: string; _fin: string; _praticien_id: string }
        Returns: string
      }
      sante_ventes_par_categorie: {
        Args: { _debut: string; _fin: string; _structure_id: string }
        Returns: {
          categorie: string
          montant: number
          nb_lignes: number
        }[]
      }
      sante_verifier_cr: { Args: { _token: string }; Returns: Json }
      set_medical_theme: {
        Args: {
          _structure_id: string
          _theme: Database["public"]["Enums"]["medical_theme"]
        }
        Returns: undefined
      }
      set_secteur_activite: {
        Args: { _entreprise_id: string; _secteur: string }
        Returns: undefined
      }
      structure_module_actif: {
        Args: { _module: string; _structure_id: string }
        Returns: boolean
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
        | "tiers_payant"
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
        "tiers_payant",
      ],
      medical_theme: ["clinique", "laboratoire", "urgences"],
      membership_status: ["invite", "actif", "suspendu"],
      structure_type: ["cabinet", "laboratoire", "mixte"],
    },
  },
} as const
