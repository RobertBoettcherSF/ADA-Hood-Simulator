with Hood.City.Plan;

package body Hood.City.Standard is

   package P renames Hood.City.Plan;
   use type P.Cell_Use;

   Cell_Pitch : constant Long_Float := 54.0;  --  constants.ts:14
   Street_W   : constant Long_Float := 14.0;  --  constants.ts:13
   Inset      : constant Long_Float := 3.0;   --  citygen.ts:277

   --  Lot bounds as 1.2.91 holds them (floating point), for the
   --  headquarters' cell test (citygen.ts:297-311).
   Lot_X, Lot_Y, Lot_W, Lot_H : array (Integer_32 range 0 .. Max_Lots - 1) of Long_Float;

   function Rect_X (B : Block_Rec) return Long_Float is
     (Long_Float (B.GX) * Cell_Pitch + Street_W / 2.0 + Inset);
   function Rect_Y (B : Block_Rec) return Long_Float is
     (Long_Float (B.GY) * Cell_Pitch + Street_W / 2.0 + Inset);
   function Rect_W (B : Block_Rec) return Long_Float is
     (Long_Float (B.Span_X) * Cell_Pitch - Street_W - Inset * 2.0);
   function Rect_H (B : Block_Rec) return Long_Float is
     (Long_Float (B.Span_Y) * Cell_Pitch - Street_W - Inset * 2.0);

   --  Content id to the landmark type of a civic block (citygen.ts:231-238).
   function Civic_Type (Content : Integer_32) return Integer_32 is
     (case Content is
         when P.City_Hall   => T_City_Hall,
         when P.Hospital    => T_Hospital,
         when P.Police_HQ   => T_Police_Hq,
         when P.Employment  => T_Labour_Exchange,
         when P.Fire_Dept   => T_Firehouse,
         when P.US_Post     => T_Us_Post,
         when P.Museum      => T_Museum,
         when P.Courthouse  => T_Courthouse,
         when P.Baths       => T_Public_Baths,
         when P.FBI_HQ      => T_Fbi_Hq,
         when P.Orphanage   => T_Orphanage,
         when P.School      => T_School,
         when P.Church_H | P.Church_V_Lower | P.Church_V_Upper => T_Church,
         when P.Power_Plant => T_Power_Plant,
         when P.Water_Plant => T_Water_Plant,
         when P.Station     => T_Railroad,
         when P.Radio       => T_Radio_Station,
         when P.Newspaper   => T_Newspaper,
         when P.Docks       => T_Docks,
         when others        => No_Id);

   function Works (Content : Integer_32) return Boolean is
     (Content in P.Docks | P.Station | P.Power_Plant | P.Water_Plant);

   --  citygen.ts:249-254
   function Area_Of (Content, LV : Integer_32) return District is
     (if Civic_Type (Content) /= No_Id and then not Works (Content) then Civic
      elsif Content in 10 .. 14 or else Works (Content) then Industrial
      elsif Content in 15 .. 18
        or else Content in P.Department_Store | P.Bank_Large | P.Hotel_Large
      then (if LV >= 150 then Downtown else Commercial)
      else Residential);

   --  citygen.ts:241-247
   function Use_Of (Content : Integer_32) return Block_Use is
     (if P.Is_Park (Content) then Park
      elsif Content = P.Plaza then Plaza
      elsif Content in P.Avenue_H | P.Avenue_V | P.Avenue_Crossing
                     | P.Rail_Over_Avenue | P.Bridge then Avenue
      elsif P.Is_River (Content) or else Content = P.Rail_Bridge then Water
      elsif Civic_Type (Content) /= No_Id then Civic_Site
      else Urban);

   procedure New_Lot
     (C : in out City_State; Block, Index : Integer_32;
      X, Y, W, H : Long_Float; Kind_Of : Type_Id; Trade : Integer_32)
   is
      Lot, B : Integer_32;
   begin
      Add_Lot (C, Block, Index, X, Y, W, H, South, Lot);
      if Lot = No_Id then
         return;
      end if;
      Lot_X (Lot) := X;
      Lot_Y (Lot) := Y;
      Lot_W (Lot) := W;
      Lot_H (Lot) := H;
      Add_Building (C, Lot, Kind_Of, Trade, B);
   end New_Lot;

   type Index_Set is array (Integer_32 range 0 .. 8) of Boolean;

   --  A lot over the given interior cells (citygen.ts:306-311).
   procedure Cell_Lot
     (C : in out City_State; Block, Index : Integer_32; Cells : Index_Set;
      Kind_Of : Type_Id; Trade : Integer_32)
   is
      B  : constant Block_Rec := C.Blocks (Block);
      CW : constant Long_Float := Rect_W (B) / 3.0;
      CH : constant Long_Float := Rect_H (B) / 3.0;
      C0, R0 : Integer_32 := 2;
      C1, R1 : Integer_32 := 0;
   begin
      for I in Integer_32 range 0 .. 8 loop
         if Cells (I) then
            C0 := Integer_32'Min (C0, I mod 3);
            C1 := Integer_32'Max (C1, I mod 3);
            R0 := Integer_32'Min (R0, I / 3);
            R1 := Integer_32'Max (R1, I / 3);
         end if;
      end loop;
      New_Lot (C, Block, Index,
               Rect_X (B) + Long_Float (C0) * CW, Rect_Y (B) + Long_Float (R0) * CH,
               Long_Float (C1 - C0 + 1) * CW, Long_Float (R1 - R0 + 1) * CH,
               Kind_Of, Trade);
   end Cell_Lot;

   function Only (I : Integer_32) return Index_Set is
     [for J in Index_Set'Range => J = I];

   procedure Build
     (C    : in out City_State;
      Main : in out Hood.Random.Mulberry;
      Seed : Unsigned_32)
   is
      Ok       : Boolean;
      Content, LV, Id, Root, Church, Park_Name : Integer_32;
      All_Park : Boolean;
   begin
      P.Run (Seed, 2, C.Plan_Retries, Ok);  --  churchCountForSize (32) = 2
      if not Ok then
         C.Status := Status_Plan_Failed;
         return;
      end if;
      if P.Overflow then
         C.Status := Status_Full;
      end if;

      --  Blocks (citygen.ts:267-279).
      for GY in Integer_32 range 0 .. Integer_32 (P.H) - 1 loop
         for GX in Integer_32 range 0 .. Integer_32 (P.W) - 1 loop
            Id := GY * P.W + GX;
            Content := P.Content (Id);
            LV := P.Land_Value (Id);
            C.Blocks (Id) :=
              (GX => GX, GY => GY, Area => Area_Of (Content, LV),
               Land_Value => (200 * LV + 255) / 510,  --  Math.round (lv * 100 / 255)
               Squalor => 0, Use_Of => Use_Of (Content),
               Span_X => 1, Span_Y => 1, Merged_Into => No_Id,
               Content => Content, Plan_Value => LV,
               Rail => Content in P.Rail | P.Rail_Bridge | P.Rail_Over_Avenue | P.Station,
               Landmark => No_Id, Name => No_Id, Module => No_Id, Turn => 0,
               Center_X => Hood.Units.Whole (GX * 54 + 27),
               Center_Y => Hood.Units.Whole (GY * 54 + 27),
               First_Lot => 0, Lots => 0);
            case C.Blocks (Id).Area is
               when Residential =>
                  Hood.Random.Int (Main, 30, 70, C.Blocks (Id).Squalor);
               when Industrial =>
                  Hood.Random.Int (Main, 28, 60, C.Blocks (Id).Squalor);
               when others =>
                  Hood.Random.Int (Main, 5, 34, C.Blocks (Id).Squalor);
            end case;
         end loop;
      end loop;
      C.Block_Count := P.N;

      --  Parks and church grounds are single sites (citygen.ts:280-295).
      Park_Name := 0;
      for K in Integer_32 range 0 .. P.Park_Count - 1 loop
         declare
            PK : constant P.Park_Rec := P.Parks (K);
         begin
            Church := No_Id;
            All_Park := True;
            for Y in PK.Y .. PK.Y + PK.H - 1 loop
               for X in PK.X .. PK.X + PK.W - 1 loop
                  Id := Y * P.W + X;
                  if Church = No_Id and then Civic_Type (C.Blocks (Id).Content) = T_Church then
                     Church := Id;
                  end if;
               end loop;
            end loop;
            for Y in PK.Y .. PK.Y + PK.H - 1 loop
               for X in PK.X .. PK.X + PK.W - 1 loop
                  Id := Y * P.W + X;
                  if Id /= Church and then not P.Is_Park (C.Blocks (Id).Content) then
                     All_Park := False;
                  end if;
               end loop;
            end loop;
            if All_Park then
               Root := PK.Y * P.W + PK.X;
               for Y in PK.Y .. PK.Y + PK.H - 1 loop
                  for X in PK.X .. PK.X + PK.W - 1 loop
                     Id := Y * P.W + X;
                     C.Blocks (Id).Use_Of := (if Church /= No_Id then Civic_Site else Park);
                     if Id /= Root then
                        C.Blocks (Id).Merged_Into := Root;
                     end if;
                  end loop;
               end loop;
               C.Blocks (Root).Span_X := PK.W;
               C.Blocks (Root).Span_Y := PK.H;
               if Church /= No_Id then
                  C.Blocks (Root).Landmark := T_Church;
                  for J in Integer_32 range 0 .. P.Church_Count - 1 loop
                     if P.Churches (J).Y * P.W + P.Churches (J).X = Church
                       and then C.Blocks (Root).Name = No_Id
                     then
                        C.Blocks (Root).Name := J;
                     end if;
                  end loop;
                  C.Blocks (Root).Content := C.Blocks (Church).Content;
                  C.Blocks (Root).Plan_Value := C.Blocks (Church).Plan_Value;
                  C.Blocks (Root).Area := Civic;
               else
                  C.Blocks (Root).Name := Park_Name mod 4;
                  Park_Name := Park_Name + 1;
               end if;
               declare
                  B : constant Block_Rec := C.Blocks (Root);
               begin
                  C.Blocks (Root).Center_X := To_Units (Rect_X (B) + Rect_W (B) / 2.0);
                  C.Blocks (Root).Center_Y := To_Units (Rect_Y (B) + Rect_H (B) / 2.0);
               end;
            end if;
         end;
      end loop;

      --  Lots and buildings (citygen.ts:313-351).
      for Block in Integer_32 range 0 .. C.Block_Count - 1 loop
         declare
            B    : constant Block_Rec := C.Blocks (Block);
            F    : P.Fill renames P.Fills (Block);
            Cells : Index_Set;
            Width, Height, CX, CY : Long_Float;
            First, Index : Integer_32;
            In_Run : Boolean;
         begin
            if B.Merged_Into /= No_Id or else B.Use_Of in Park | Plaza | Avenue | Water then
               null;
            elsif B.Use_Of = Civic_Site then
               Id := Civic_Type (B.Content);
               C.Blocks (Block).Landmark := Id;
               if Id = T_Church then
                  Width := Long_Float'Min (Rect_W (B) * 0.7, 21.0);
                  Height := Long_Float'Min (Rect_H (B) * 0.65, 38.0);
               else
                  Width := Rect_W (B) - 2.0;
                  Height := Rect_H (B) - 2.0;
               end if;
               CX := Long_Float (B.Center_X) / 256.0;
               CY := Long_Float (B.Center_Y) / 256.0;
               New_Lot (C, Block, 1, CX - Width / 2.0, CY - Height / 2.0, Width, Height, Id,
                        (if F.Present and then F.Firms > 0 then F.List (0).Kind else No_Kind));
            elsif not F.Present then
               Cell_Lot (C, Block, 4, Only (4), Empty_Land, No_Kind);
            else
               --  The row's tenement.
               Cells := [for J in Index_Set'Range => F.Uses (J) = P.Tenement];
               First := No_Id;
               for J in reverse Integer_32 range 0 .. 8 loop
                  if Cells (J) then
                     First := J;
                  end if;
               end loop;
               if First /= No_Id then
                  Cell_Lot (C, Block, First, Cells,
                            (if B.Plan_Value < 56 then T_Tenement_Poor else T_Tenement_Mid),
                            P.K_Tenement);
               end if;
               --  Row houses and shop frontage: one terrace per run of
               --  house cells down each interior column.
               for Col in Integer_32 range 0 .. 2 loop
                  In_Run := False;
                  Cells := [others => False];
                  for Row in Integer_32 range 0 .. 3 loop
                     if Row < 3 and then F.Uses (Row * 3 + Col) = P.House then
                        Cells (Row * 3 + Col) := True;
                        In_Run := True;
                     elsif In_Run then
                        Index := No_Id;
                        for J in Integer_32 range 0 .. 8 loop
                           if Cells (J) and then Index = No_Id then
                              Index := J;
                           end if;
                        end loop;
                        if Cells (4) and then Index = 4 then
                           for J in Integer_32 range 5 .. 8 loop
                              if Cells (J) and then Index = 4 then
                                 Index := J;
                              end if;
                           end loop;
                        end if;
                        Cell_Lot (C, Block, Index, Cells, T_Residence, P.K_Residential);
                        Cells := [others => False];
                        In_Run := False;
                     end if;
                  end loop;
               end loop;
               --  The businesses.
               for J in Integer_32 range 0 .. F.Firms - 1 loop
                  Cells := [others => False];
                  for K in Integer_32 range 0 .. F.List (J).Count - 1 loop
                     Cells (F.List (J).Cells (K)) := True;
                  end loop;
                  Cell_Lot (C, Block, F.List (J).Master, Cells,
                            Kind_Type (F.List (J).Kind), F.List (J).Kind);
               end loop;
               --  Empty lots and soup kitchens.
               for J in Integer_32 range 0 .. 8 loop
                  if F.Uses (J) = P.Lot then
                     Cell_Lot (C, Block, J, Only (J), Empty_Land, No_Kind);
                  elsif F.Uses (J) = P.Soup_Kitchen then
                     Cell_Lot (C, Block, J, Only (J), T_Soup_Kitchen, P.K_Soup_Kitchen);
                  end if;
               end loop;
            end if;
         end;
      end loop;
   end Build;

   ----------------------------------------------------------------------
   --  Headquarters on the fine grid (5 x 5 cells per block)
   ----------------------------------------------------------------------

   FW : constant := Standard_W * 5;
   FH : constant := Standard_H * 5;
   subtype Fine is Integer_32 range 0 .. FW * FH - 1;

   --  Cell classes of the fine grid (proposed names; 0 = nothing).
   Cls_None      : constant := 0;
   Cls_Lot       : constant := 1;
   Cls_Office    : constant := 2;
   Cls_Business  : constant := 3;
   Cls_Charity   : constant := 7;
   Cls_Civic     : constant := 8;
   Cls_Tenement  : constant := 9;
   Cls_House     : constant := 10;
   Cls_Other     : constant := 12;

   Fine_Cls      : array (Fine) of Integer_32;
   Fine_Building : array (Fine) of Integer_32;
   Fine_Master   : array (Fine) of Boolean;
   Fine_Exchange : array (Fine) of Boolean;  --  civic cells of the labour exchange
   Visited       : array (Fine) of Boolean;

   K_Gym            : constant := 57;
   K_Pool_Hall      : constant := 91;
   K_Perfume_Store  : constant := 85;
   Band_Reach       : constant := 55;
   --  Eleven attitude bands of 480 units at 96 units per fine cell
   --  (attitudes.ts:92-93, :112-114): 11 * 480 / 96 = 55 cells.

   function Class_Of (C : City_State; B : Integer_32; Civic_Block : Boolean) return Integer_32 is
      T : constant Type_Id := C.Buildings (B).Kind_Of;
   begin
      if Civic_Block then
         return Cls_Civic;
      elsif T = T_Office then
         return Cls_Office;  --  a gang office (step 4)
      elsif T = Empty_Land then
         return Cls_Lot;
      elsif Type_Class (T) = Tenement then
         return Cls_Tenement;
      elsif Type_Class (T) = Residential then
         return Cls_House;
      elsif T = T_Soup_Kitchen then
         return Cls_Charity;
      elsif Type_Class (T) in Commercial | Industrial then
         return Cls_Business;
      else
         return Cls_Other;
      end if;
   end Class_Of;

   --  Buildings that get an owner when people are placed (citygen.ts:544-559).
   function Owned (C : City_State; B : Integer_32) return Boolean is
     (Type_Class (C.Buildings (B).Kind_Of) in Commercial | Industrial | Tenement
      or else C.Buildings (B).Kind_Of in T_Church | T_Orphanage | T_Newspaper);

   procedure Fill_Fine_Grid (C : City_State) is
      Covered : Index_Set;
      Lot_I, B, Cls, F : Integer_32;
      Civic_Block : Boolean;
      CW, CH, PX, PY : Long_Float;
   begin
      Fine_Cls := [others => Cls_None];
      Fine_Building := [others => No_Id];
      Fine_Master := [others => False];
      Fine_Exchange := [others => False];
      for Block in Integer_32 range 0 .. C.Block_Count - 1 loop
         declare
            BR : constant Block_Rec := C.Blocks (Block);
         begin
            if BR.Merged_Into = No_Id then
               Civic_Block := BR.Use_Of = Civic_Site;
               CW := Rect_W (BR) / 3.0;
               CH := Rect_H (BR) / 3.0;
               for L in Integer_32 range 0 .. BR.Lots - 1 loop
                  Lot_I := BR.First_Lot + L;
                  B := C.Lots (Lot_I).Building;
                  if B /= No_Id then
                     Cls := Class_Of (C, B, Civic_Block);
                     if Civic_Block then
                        Covered := [others => True];
                     else
                        for I in Integer_32 range 0 .. 8 loop
                           PX := Rect_X (BR) + (Long_Float (I mod 3) + 0.5) * CW;
                           PY := Rect_Y (BR) + (Long_Float (I / 3) + 0.5) * CH;
                           Covered (I) := PX >= Lot_X (Lot_I)
                             and then PX <= Lot_X (Lot_I) + Lot_W (Lot_I)
                             and then PY >= Lot_Y (Lot_I)
                             and then PY <= Lot_Y (Lot_I) + Lot_H (Lot_I);
                        end loop;
                        Covered (C.Lots (Lot_I).Index) := True;
                     end if;
                     for I in Integer_32 range 0 .. 8 loop
                        if Covered (I) then
                           F := (BR.GY * 5 + 1 + I / 3) * FW + BR.GX * 5 + 1 + I mod 3;
                           Fine_Cls (F) := Cls;
                           Fine_Building (F) := B;
                           Fine_Master (F) := I = C.Lots (Lot_I).Index;
                           Fine_Exchange (F) := Civic_Block and then BR.Content = P.Employment;
                        end if;
                     end loop;
                  end if;
               end loop;
            end if;
         end;
      end loop;
   end Fill_Fine_Grid;

   function At_Cell (X, Y : Integer_32) return Integer_32 is
     (if X in 0 .. FW - 1 and then Y in 0 .. FH - 1 then Y * FW + X else No_Id);

   function Cls_At (X, Y : Integer_32) return Integer_32 is
     (if At_Cell (X, Y) = No_Id then Cls_None else Fine_Cls (At_Cell (X, Y)));

   function Chain_Hit (X, Y : Integer_32) return Boolean is
     (At_Cell (X, Y) /= No_Id
      and then Fine_Cls (At_Cell (X, Y)) /= Cls_None
      and then not Visited (At_Cell (X, Y))
      and then Fine_Master (At_Cell (X, Y))
      and then Fine_Cls (At_Cell (X, Y)) in Cls_Business | Cls_Tenement);

   --  The start cell, then square rings: axis points, edge pairs, corners.
   procedure Spiral (X, Y : Integer_32; HX, HY : out Integer_32; Found : out Boolean) is
      procedure Try (TX, TY : Integer_32) is
      begin
         if not Found and then Chain_Hit (TX, TY) then
            HX := TX;
            HY := TY;
            Found := True;
         end if;
      end Try;
      V : Integer_32 := 1;
   begin
      Found := False;
      HX := X;
      HY := Y;
      Try (X, Y);
      while not Found loop
         exit when X - V < 0 and then X + V >= FW and then Y + V >= FH and then Y - V < 0;
         Try (X, Y + V);
         Try (X, Y - V);
         Try (X + V, Y);
         Try (X - V, Y);
         for K in Integer_32 range 1 .. V - 1 loop
            Try (X + K, Y + V);
            Try (X + K, Y - V);
            Try (X - K, Y + V);
            Try (X - K, Y - V);
            Try (X + V, Y + K);
            Try (X + V, Y - K);
            Try (X - V, Y + K);
            Try (X - V, Y - K);
         end loop;
         Try (X + V, Y + V);
         Try (X + V, Y - V);
         Try (X - V, Y + V);
         Try (X - V, Y - V);
         V := V + 1;
      end loop;
   end Spiral;

   procedure Place_Headquarters (C : in out City_State; Seed : Unsigned_32) is
      G : Hood.Random.Plan_Lcg :=
        Hood.Random.Plan_Seeded (Hood.Random.Headquarters_Seed (Seed));
      function R return Integer_32 is
         V : Hood.Random.Plan_Value;
      begin
         Hood.Random.Plan_Next (G, V);
         return V;
      end R;
      HW : constant Integer_32 := Standard_W / 2;
      HH : constant Integer_32 := Standard_H / 2;
      function Quadrant (Gang, BX, BY : Integer_32) return Boolean is
        ((if Gang = 0 or else Gang = 2 then BX < HW else BX >= HW)
         and then (if Gang = 0 or else Gang = 1 then BY < HH else BY >= HH));
      function Candidate (B : Block_Rec) return Boolean is
        ((B.Content <= 3 and then B.Plan_Value > 16#30# and then B.Plan_Value < 16#3F#)
         or else (B.Content in 15 .. 18
                  and then B.Plan_Value > 16#50# and then B.Plan_Value < 16#5F#));
      SX, SY, N, X, Y, JX, JY, Radius, Kind, Block, Hit_X, Hit_Y, Dx, Dy : Integer_32;
      Placed, Hit, Done : Boolean;
      F : Integer_32;
   begin
      Fill_Fine_Grid (C);
      for Gang in Integer_32 range 0 .. 3 loop
         --  Centroid of the quadrant's gyms, pool halls, docks and labour
         --  exchange cells; with none, the far corner.
         SX := 0;
         SY := 0;
         N := 0;
         for FY in Integer_32 range 0 .. FH - 1 loop
            for FX in Integer_32 range 0 .. FW - 1 loop
               if Quadrant (Gang, FX / 5, FY / 5) then
                  F := FY * FW + FX;
                  if (Fine_Cls (F) = Cls_Business
                      and then C.Buildings (Fine_Building (F)).Trade in K_Gym | K_Pool_Hall | P.K_Docks)
                    or else (Fine_Cls (F) = Cls_Civic and then Fine_Exchange (F))
                  then
                     SX := SX + FX;
                     SY := SY + FY;
                     N := N + 1;
                  end if;
               end if;
            end loop;
         end loop;
         X := (if N > 0 then SX / N else FW);
         Y := (if N > 0 then SY / N else FH);
         --  Jitter onto a building cell.
         Radius := 20;
         Placed := False;
         while not Placed loop
            for Tries in Integer_32 range 1 .. 50 loop
               exit when Placed;
               JX := Integer_32'Max (0, Integer_32'Min (FW - 1, X + R mod (2 * Radius) - Radius));
               JY := Integer_32'Max (0, Integer_32'Min (FH - 1, R mod (2 * Radius) + Y - Radius));
               if Cls_At (JX, JY) in 1 .. 11 then
                  X := JX;
                  Y := JY;
                  Placed := True;
               end if;
            end loop;
            Radius := Radius + 5;
            exit when Radius > FW + FH;
         end loop;
         --  Chain of nearest unvisited business or tenement masters.
         Visited := [others => False];
         Done := False;
         for Step in Integer_32 range 1 .. FW * FH loop
            exit when Done;
            Spiral (X, Y, Hit_X, Hit_Y, Hit);
            exit when not Hit;
            X := Hit_X;
            Y := Hit_Y;
            F := Y * FW + X;
            Visited (F) := True;
            Block := (Y / 5) * Standard_W + X / 5;
            if Quadrant (Gang, C.Blocks (Block).GX, C.Blocks (Block).GY)
              and then Candidate (C.Blocks (Block))
              and then Cls_At (X - X mod 5 + 2, Y - Y mod 5 + 2) = Cls_Lot
            then
               --  A business master would front by its income group; no
               --  kind and land value reaches groups 15 .. 17
               --  (checked over the whole table), so only tenements front.
               if Fine_Cls (F) = Cls_Tenement then
                  Kind := K_Perfume_Store;
                  Fine_Cls (F) := Cls_Business;
                  Fine_Cls (At_Cell (X - X mod 5 + 2, Y - Y mod 5 + 2)) := Cls_Office;
                  C.HQ_Count := C.HQ_Count + 1;
                  C.HQ (Gang + 1) :=
                    (Block => Block, Front => Fine_Building (F), Front_As => Kind,
                     FX => X, FY => Y);
                  Done := True;
               end if;
            end if;
         end loop;
         if not Done then
            C.Status := Status_No_Site;
            return;
         end if;
         --  Shopkeepers' attitudes to this gang take one draw per owner
         --  within ten blocks (attitudes.ts:106-121); the owners themselves
         --  come in step 4.
         for FY in Integer_32 range 0 .. FH - 1 loop
            for FX in Integer_32 range 0 .. FW - 1 loop
               F := FY * FW + FX;
               if Fine_Master (F) and then Fine_Cls (F) in 1 .. 10
                 and then Owned (C, Fine_Building (F))
               then
                  Dx := FX - C.HQ (Gang + 1).FX;
                  Dy := FY - C.HQ (Gang + 1).FY;
                  --  trunc (trunc (hypot * 96) / 480) <= 10 exactly when
                  --  hypot < 55, i.e. dx*dx + dy*dy < 55*55.
                  if Dx * Dx + Dy * Dy < Band_Reach * Band_Reach then
                     Kind := R;
                  end if;
               end if;
            end loop;
         end loop;
      end loop;
   end Place_Headquarters;

   procedure Starting_Sites
     (C     : City_State;
      Gang  : Integer_32;
      Taken : Building_Flags;
      Sites : out Starting_Site_List;
      Count : out Integer_32)
   is
      X     : constant Integer_32 := C.HQ (Gang).FX;
      Y     : constant Integer_32 := C.HQ (Gang).FY;
      Front : constant Integer_32 := C.HQ (Gang).Front;
      Full  : Boolean := False;
      procedure Visit (TX, TY : Integer_32) is
         F, B : Integer_32;
         Seen : Boolean := False;
      begin
         if Full or else Count >= Max_Starting_Sites then
            Full := True;
            return;
         end if;
         F := At_Cell (TX, TY);
         if F = No_Id or else not Fine_Master (F)
           or else Fine_Cls (F) not in Cls_Business | Cls_Tenement
         then
            return;
         end if;
         B := Fine_Building (F);
         for K in 1 .. Count loop
            Seen := Seen or else Sites (Integer (K)) = B;
         end loop;
         if not Seen and then not Taken (B) and then B /= Front then
            Count := Count + 1;
            Sites (Integer (Count)) := B;
         end if;
      end Visit;
      V : Integer_32 := 1;
   begin
      Sites := [others => No_Id];
      Count := 0;
      Fill_Fine_Grid (C);
      Visit (X, Y);
      while not Full loop
         exit when X - V < 0 and then X + V >= FW and then Y + V >= FH and then Y - V < 0;
         Visit (X, Y + V);
         Visit (X, Y - V);
         Visit (X + V, Y);
         Visit (X - V, Y);
         for K in Integer_32 range 1 .. V - 1 loop
            Visit (X + K, Y + V);
            Visit (X + K, Y - V);
            Visit (X - K, Y + V);
            Visit (X - K, Y - V);
            Visit (X + V, Y + K);
            Visit (X + V, Y - K);
            Visit (X - V, Y + K);
            Visit (X - V, Y - K);
         end loop;
         Visit (X + V, Y + V);
         Visit (X + V, Y - V);
         Visit (X - V, Y + V);
         Visit (X - V, Y - V);
         V := V + 1;
      end loop;
   end Starting_Sites;

end Hood.City.Standard;
